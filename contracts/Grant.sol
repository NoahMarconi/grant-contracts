pragma solidity >=0.5.10 <0.6.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./FundThreshold.sol";
import "./ISignal.sol";


/**
 * @title Grants Spec Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract Grant is FundThreshold, ISignal {
    using SafeMath for uint256;


    /*----------  Modifiers  ----------*/

    modifier isGrantee() {
        require(
            grantees[msg.sender].targetFunding > 0,
            "isGrantee::Invalid Sender. Sender is not a grantee for this grant."
        );

        _;
    }

    modifier isDonor() {
        require(
            donors[msg.sender].funded > 0,
            "isDonor::Invalid Sender. Sender is not a donor for this grant."
        );

        _;
    }

    modifier onlyManager() {
        require(
            msg.sender == manager,
            "onlyManager::Invalid Sender. Sender is not the manager of this grant."
        );

        _;
    }


    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of unlocked funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     * @param _manager (Optional) Multisig or EOA address of grant manager.
     * @param _currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param _targetFunding (Optional) Funding threshold required to release funds.
     * @param _fundingExpiration (Optional) Block number after which votes OR funds (dependant on GrantType) cannot be sent.
     * @param _contractExpiration (Optional) Block number after which payouts must be complete or anyone can trigger refunds.
     * @return true or transaction reverts.
     */
    constructor(
        address[] _grantees,
        uint256[] _amounts,
        address _manager,
        address _currency,
        uint256 _targetFunding,
        uint256 _fundingExpiration,
        uint256 _contractExpiration
    )
        public
        returns(bool)
    {

        require(
            // solium-disable-next-line security/no-block-members
            _fundingExpiration == 0 || _fundingExpiration > block.number,
            "constructor::Invalid Argument. _fundingExpiration must be 0 or greater than current block."
        );

        require(
            // solium-disable-next-line security/no-block-members
            _contractExpiration == 0 || _contractExpiration > block.number,
            "constructor::Invalid Argument. _contractExpiration must be 0 or greater than current block."
        );

        require(
            grantees.length > 0,
            "constructor::Invalid Argument. Must have one or more grantees."
        );

        // Initialize globals.
        manager = _manager;
        currency = _currency;
        targetFunding = _targetFunding;
        fundingExpiration = _fundingExpiration;
        contractExpiration = _contractExpiration;
        totalGrantees = _grantees.length;

        // Initialize Grantees.
        for (uint256 i = 0; i < _grantees.length; i++) {
            address currentGrantee = _grantees[i];
            address currentAmount = _amounts[i];

            require(
                currentAmount > 0,
                "constructor::Invalid Argument. Grantee's allocation (currentAmount) must be greater than 0."
            );
    
            if (i > 0) {
                require(
                    currentGrantee > grantees[i.sub(1)],
                    "constructor::Invalid Argument. Grantee's address array must be sorted smallest to largest."
                );
            }

            _grantees[currentGrantee].targetFunding = currentAmount;
        }

        return true;
    }


    /*----------  Public Getters  ----------*/

    /**
     * @dev Grant Getter.
     * @param id GUID for the grant to return.
     * @return The Grant struct.
     */
    function getGrant(bytes32 id)
        public
        view
        returns (Grant memory)
    {
        return _grants[id];
    }

    /**
     * @dev Grantor Getter.
     * @param id GUID for the grant.
     * @param grantor Address for the grantor.
     * @return The Grantor struct.
     */
    function getGrantor(bytes32 id, address grantor)
        public
        view
        returns (Grantor memory)
    {
        return _grantors[id][grantor];
    }

    /**
     * @dev Grantee Getter.
     * @param id GUID for the grant.
     * @param grantee Address for the grantee.
     * @return The Grantee struct.
     */
    function getGrantee(bytes32 id, address grantee)
        public
        view
        returns (Grantee memory)
    {
        return _grantees[id][grantee];
    }

    /**
     * @dev GrantManager Getter.
     * @param id GUID for the grant.
     * @param grantManager Address for the grantManager.
     * @return The GrantManager struct.
     */
    function getGrantManager(bytes32 id, address grantManager)
        public
        view
        returns (GrantManager memory)
    {
        return _grantManagers[id][grantManager];
    }


    /*----------  Public Methods  ----------*/

    /**
     * @dev Fund a grant proposal.
     * @param id GUID for the grant to fund.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Cumulative funding received for this grant.
     */
    function fund(bytes32 id, uint256 value)
        public
        payable
        returns (uint256 balance)
    {
        // Defer to correct funding method.
        if(_grants[id].currency == address(0)) {
            require(
                msg.value == value,
                "fund::Invalid Argument. value must match msg.value."
            );
        } else {
            require(
                IERC20(_grants[id].currency)
                    .transferFrom(msg.sender, address(this), value),
                "fund::Transfer Error. ERC20 token transferFrom failed."
            );
        }

        // Record Contribution.
        // Add new Grantor or add to existing Grantor funded total.
        if (!_grantors[id][msg.sender].isGrantor) {
            _grantors[id][msg.sender] = Grantor({
                isGrantor: true,
                grantor: msg.sender,
                funded: value,
                refunded: 0
            });

            _grants[id].totalGrantors = uint32(uint256(_grants[id].totalGrantors).add(1));
        } else {
            _grantors[id][msg.sender].funded = _grantors[id][msg.sender]
                .funded.add(value);
        }

        // Update funding tally.
        balance = _grants[id].totalFunded.add(value);
        _grants[id].totalFunded = balance;

        // Log event.
        emit LogFunding(id, msg.sender, value);

        // May expand to handle variety of grantTypes.
        uint256 result;
        if (_grants[id].grantType == GrantType.FUND_THRESHOLD) {
           result = FundThreshold.fund(id, value);
        }

        return _grants[id].totalFunded
            .sub(_grants[id].totalPayed)
            .sub(_grants[id].totalRefunded);
    }

    /**
     * @dev Pay a grantee.
     * @param id GUID for the grant to fund.
     * @param grantee Recipient of payment.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Remaining funding available in this grant.
     */
    function payout(bytes32 id, address grantee, uint256 value)
        public
        returns (uint256 balance)
    {
        // Accounts for over funded grants.
        //
        // Takes allocation percentage to determine Grantee's actual allocation
        // of the total amount funded.
        //
        // Precise to 1 WEI if Ether.
        uint256 actualAllocation;
        if (_grantees[id][grantee].allocation < 100) {
            uint256 allocation = _grantees[id][grantee].allocation;
            actualAllocation = _grants[id].totalFunded
                .mul(allocation.mul(PRECISION_M))
                .div(PRECISION_D);
        } else {
            actualAllocation = _grants[id].totalFunded;
        }

        uint256 remainingAllocation = actualAllocation
            .sub(_grantees[id][grantee].received);

        require(
            remainingAllocation >= value,
            "payout::Invalid Argument. Value cannot exceed Grantee's remaining allocation."
        );

        require(
            _grants[id].grantStatus == GrantStatus.PAY,
            "payout::Status Error. Must be GrantStatus.PAY to issue payment."
        );

        require(
            _grantManagers[id][msg.sender].isGrantManager || grantee == msg.sender,
            "payout::Invalid Argument. If not a GrantManger, msg.sender must match grantee argument."
        );


        uint256 paymentsArrayLength = _grantees[id][grantee].payments.length;
        // TODO: handle empty array
        Payment memory lastPayment = _grantees[id][grantee].payments[paymentsArrayLength - 1];
        bool lastPaymentPaid = lastPayment.paid;

        // The following checks are taking place:
        // 1. if paid, create new payment request.
        // 2. else if approved, send it (59 out of 100 pass with 2/3, 3/5, etc.)
        // 3. else if grant manager add approvals,
        // 4. else revert. as a grantee is request a payout while on is currently pending.
        if (lastPaymentPaid) {
            // 1. If paid, create new payment request.
            _grantees[id][grantee].payments.push(
                Payment({ approvals: 0, amount: value, paid: false })
            );

            emit LogPaymentRequest(id, grantee, value);
        } else if (lastPayment.approvals > 59) {

            require(
                value == lastPayment.amount,
                "payout::Invalid Argument. Value does not match lastPayment.amount."
            );

            // 2. else if approved, send it (59 out of 100 pass with 2/3, 3/5, etc.)
            address currency = _grants[id].currency;
            if (currency == address(0)) {
                require(
                    // solium-disable-next-line security/no-send
                    address(uint160(grantee)).send(value),
                    "payout::Transfer Error. Unable to send value to Grantee."
                );
            } else {
                require(
                    IERC20(currency)
                        .transfer(grantee, value),
                    "signal::Transfer Error. ERC20 token transfer failed."
                );
            }

            emit LogPayment(id, grantee, value);
        } else if (_grantManagers[id][msg.sender].isGrantManager) {
            // 3. else if grant manager add approvals,
            // TODO: stop from GM from approving twice.
            uint8 approvals;
            emit LogAddPaymentApprovals(id, grantee, value, approvals);
        } else {
            // 4. else revert.
            revert("payout::Status Error. Cannot request a new payment while a payment is pending.");
        }

        return _grants[id].totalFunded
            .sub(_grants[id].totalPayed)
            .sub(_grants[id].totalRefunded);
    }

    /**
     * @dev Refund a grantor.
     * @param id GUID for the grant to refund.
     * @param grantor Recipient of refund.
     * @param value Amount in WEI or GRAINS to fund.
     * @return True if successful, otherwise false.
     */
    function refund(bytes32 id, address grantor, uint256 value)
        public
        returns (uint256 balance)
    {
        return _grants[id].totalFunded
            .sub(_grants[id].totalPayed)
            .sub(_grants[id].totalRefunded);
    }

    /**
     * @dev Cancel grant and enable refunds.
     * @param id GUID for the grant to refund.
     * @return True if successful, otherwise false.
     */
    function cancelGrant(bytes32 id)
        public
        returns (uint256 balance)
    {
        require(
            _grants[id].grantStatus == GrantStatus.SIGNAL ||
            _grants[id].grantStatus == GrantStatus.FUND ||
            _grants[id].grantStatus == GrantStatus.PAY,
            "cancelGrant::Status Error. Must be GrantStatus.SIGNAL, GrantStatus.FUND, or GrantStatus.PAY to cancel."
        );

        bool granteeOrGrantManager = _grantees[id][msg.sender].isGrantee ||
            _grantManagers[id][msg.sender].isGrantManager;

        require(
            granteeOrGrantManager,
            "cancelGrant::Invalid Sender. Only a Grantee or GrantManager may cancel the grant."
        );

        // SIGNAL can simply be moved to COMPLETE.
        // Otherwise Grantors need to be refunded.
        if (_grants[id].grantStatus == GrantStatus.SIGNAL) {
            _grants[id].grantStatus = GrantStatus.COMPLETE;
            emit LogStatusChange(id, GrantStatus.COMPLETE);
        } else {
            _grants[id].grantStatus = GrantStatus.REFUND;
            emit LogStatusChange(id, GrantStatus.REFUND);
        }
        return _grants[id].totalFunded
            .sub(_grants[id].totalPayed)
            .sub(_grants[id].totalRefunded);
    }

    /**
     * @dev Voting Signal Method.
     * @param id The ID of the grant to signal in favor for.
     * @param value Number of signals denoted in Token GRAINs or WEI.
     * @return True if successful, otherwise false.
     */
    function signal(bytes32 id, uint256 value)
        external
        payable
        returns (bool)
    {

        require(
            _grants[id].grantStatus == GrantStatus.SIGNAL,
            "signal::Status Error. Must be GrantStatus.SIGNAL to signal."
        );

        address token = _grants[id].currency;

        emit LogSignal(id, msg.sender, token, value);

        // Prove signaler has control of tokens.
        if (token == address(0)) {
            require(
                msg.value == value,
                "signal::Invalid Argument. value must match msg.value."
            );

            require(
                // solium-disable-next-line security/no-send
                msg.sender.send(msg.value),
                "signal::Transfer Error. Unable to send msg.value back to sender."
            );
        } else {
            // Transfer to this contract.
            require(
                IERC20(token)
                    .transferFrom(msg.sender, address(this), value),
                "signal::Transfer Error. ERC20 token transferFrom failed."
            );

            // Transfer back to sender.
            require(
                IERC20(token)
                    .transfer(msg.sender, value),
                "signal::Transfer Error. ERC20 token transfer failed."
            );
        }

        return true;
    }

    /**
     * @dev End signaling and move to next GrantStatus.
     * @param id The GUID of the grant to end signaling for.
     */
    function endSignaling(bytes32 id)
        public
        isGrantee(id)
        returns (bool)
    {
        require(
            _grants[id].grantStatus == GrantStatus.SIGNAL,
            "endSignaling::Status Error. Must be GrantStatus.SIGNAL to end signaling."
        );

        _grants[id].grantStatus = GrantStatus.FUND;

        emit LogStatusChange(id, GrantStatus.FUND);

        return true;
    }

}
