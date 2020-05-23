pragma solidity >=0.5.10 <0.6.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/utils/ReentrancyGuard.sol";
import "./AbstractGrant.sol";
import "./ISignal.sol";


/**
 * @title Grants Spec Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract Grant is AbstractGrant, ISignal, ReentrancyGuard {
    using SafeMath for uint256;


    /*----------  Constants  ----------*/

    uint256 ATOMIC_UNITS = 10 ** 18;


    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of unlocked funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     * @param _manager (Optional) Multisig or EOA address of grant manager.
     * @param _currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param _targetFunding (Optional) Funding threshold required to release funds.
     * @param _fundingDeadline (Optional) Date after which signaling OR funds cannot be sent.
     * @param _contractExpiration (Optional) Date after which payouts must be complete or anyone can trigger refunds.
     */
    constructor(
        address[] memory _grantees,
        uint256[] memory _amounts,
        address _manager,
        address _currency,
        uint256 _targetFunding,
        uint256 _fundingDeadline,
        uint256 _contractExpiration
    )
        public
    {

        require(
            _fundingDeadline != 0 && _fundingDeadline < _contractExpiration,
            "constructor::Invalid Argument. _fundingDeadline not < _contractExpiration."
        );

        require(
        // solium-disable-next-line security/no-block-members
            _fundingDeadline != 0 && _fundingDeadline > now,
            "constructor::Invalid Argument. _fundingDeadline not > now."
        );

        require(
        // solium-disable-next-line security/no-block-members
            _contractExpiration != 0 && _contractExpiration > now,
            "constructor::Invalid Argument. _contractExpiration not > now."
        );

        require(
            _grantees.length > 0,
            "constructor::Invalid Argument. Must have one or more grantees."
        );

        require(
            _grantees.length == _amounts.length,
            "constructor::Invalid Argument. _grantees.length must equal _amounts.length"
        );

        // Initialize globals.
        manager = _manager;
        currency = _currency;
        targetFunding = _targetFunding;
        fundingDeadline = _fundingDeadline;
        contractExpiration = _contractExpiration;

        // Check _targetFunding against sum of _amounts array.
        uint256 totalFundingAmount;

        // Initialize Grantees.
        address lastAddress = address(0);
        for (uint256 i = 0; i < _grantees.length; i++) {
            address currentGrantee = _grantees[i];
            uint256 currentAmount = _amounts[i];

            require(
                currentAmount > 0,
                "constructor::Invalid Argument. currentAmount must be greater than 0."
            );

            require(
                currentGrantee > lastAddress,
                "constructor::Invalid Argument. Duplicate or out of order _grantees."
            );

            require(
                currentGrantee != _manager,
                "constructor::Invalid Argument. _manager cannot be a Grantee."
            );

            totalFundingAmount = totalFundingAmount.add(currentAmount);
            lastAddress = currentGrantee;
            grantees[currentGrantee].targetFunding = currentAmount;
        }

        require(
            (_targetFunding != 0 && totalFundingAmount == _targetFunding),
            "constructor::Invalid Argument. _targetFunding must equal totalFundingAmount."
        );

    }

    /*----------  Modifiers  ----------*/

    modifier onlyManager() {
        require(
            isManager(msg.sender),
            "onlyManager::Permission Error. Function can only be called by manager."
        );

        _;
    }

    /*----------  Public Helpers  ----------*/

    function isManager(address toCheck)
        public
        view
        returns(bool)
    {
        return manager == toCheck;
    }

    /**
     * @dev Get available grant balance.
     * @return Balance remaining in contract.
     */
    function availableBalance()
        public
        view
        returns(uint256)
    {
        return totalFunding
            .sub(totalPaid)
            .sub(totalRefunded);
    }

    /**
     * @dev Funding status check.
     * `fundingDeadline` may be 0, in which case `now` does not impact canFund response.
     * `targetFunding` may be 0, in which case `totalFunding` oes not impact can fund response.
     * @return true if can fund grant.
     */
    function canFund()
        public
        view
        returns(bool)
    {
        return (
            // solium-disable-next-line security/no-block-members
            (fundingDeadline == 0 || fundingDeadline > now) &&
            (targetFunding == 0 || totalFunding < targetFunding) &&
            !grantCancelled
        );
    }

    /**
     * @dev Grantee specific check for remaining allocated funds.
     * @param grantee's address.
     */
    function remainingAllocation(address grantee)
        public
        view
        returns(uint256)
    {
        return grantees[grantee].targetFunding
            .sub(grantees[grantee].totalPaid)
            .sub(grantees[grantee].payoutApproved);
    }


    /*----------  Public Methods  ----------*/

    /**
     * @dev Fund a grant proposal.
     * @param value Amount in WEI or ATOMIC_UNITS to fund.
     * @return Cumulative funding received for this grant.
     */
    function fund(uint256 value)
        public
        nonReentrant // OpenZeppelin mutex due to sending change if over-funded.
        returns (bool)
    {

        require(
            canFund(),
            "fund::Status Error. Grant not open to funding."
        );

        uint256 newTotalFunding = totalFunding.add(value);

        uint256 change = 0;
        if(targetFunding != 0 && newTotalFunding > targetFunding) {
            change = newTotalFunding.sub(targetFunding);
            newTotalFunding = targetFunding;
        }

        // Record Contribution.
        donors[msg.sender].funded = donors[msg.sender].funded
            .add(value)
            .sub(change); // Account for change from over-funding.

        // Update funding tally.
        totalFunding = newTotalFunding;

        // Defer to correct funding method.
        if(currency == address(0)) {
            fundWithEther(value, change);
        } else {
            fundWithToken(value, change);
        }

        // Log events.
        emit LogFunding(msg.sender, value.sub(change));

        if(targetFunding != 0 && totalFunding == targetFunding) {
            emit LogFundingComplete();
        }

        return true;
    }


    /*----------  Manager Methods  ----------*/

    /**
     * @dev Approve payment to a grantee.
     * @param value Amount in WEI or ATOMIC_UNITS to fund.
     * @param grantee Recipient of payment.
     */
    function approvePayout(uint256 value, address grantee)
        public
        onlyManager
        returns(bool)
    {

        require(
            (targetFunding != 0 && targetFunding == totalFunding),
            "approvePayout::Status Error. Cannot approve if funding target not met."
        );

        require(
            !grantCancelled,
            "approvePayout::Status Error. Cannot approve if grant is cancelled."
        );

        require(
            remainingAllocation(grantee) >= value,
            "approvePayout::Invalid Argument. value cannot exceed remaining allocation."
        );

        // Update state.
        totalPaid = totalPaid.add(value);
        grantees[grantee].payoutApproved = grantees[grantee].payoutApproved.add(value);

        emit LogPaymentApproval(grantee, value);

        return true;
    }

    /**
     * @dev Cancel grant and enable refunds.
     */
    function cancelGrant()
        public
    {
        require(
            !grantCancelled,
            "cancelGrant::Status Error. Already cancelled."
        );

        if (!isManager(msg.sender)) {
            // Non-manager may cancel grant if:
            //      1. Funding goal not met before fundingDeadline.
            //      2. Funds not completely dispersed before contractExpiration.
            require(
                // solium-disable-next-line security/no-block-members
                (fundingDeadline != 0 && fundingDeadline <= now && totalFunding < targetFunding) ||
                (contractExpiration != 0 && contractExpiration <= now),
                // solium-disable-previous-line security/no-block-members
                "cancelGrant::Invalid Sender. Sender must be manager or expired."
            );
        }

        totalRefunded = totalRefunded.add(availableBalance());

        grantCancelled = true;

        emit LogGrantCancellation();
    }

    /**
     * @dev Approve refunding a portion of the contract's available balance.
     *      Refunds are split between donors based on their contribution to totalFunded.
     * @param value Amount to refund.
     * @param grantee Grantee address to reduce allocation from.
     */
    function approveRefund(uint256 value, address grantee)
        public
        onlyManager
    {

        if (grantee != address(0)) {
            require(
                remainingAllocation(grantee) >= value,
                "approveRefund::Invalid Argument. Value greater than remaining allocation."
            );

            // Reduce allocation.
            grantees[grantee].targetFunding.sub(value);
        }

        require(
            value <= availableBalance(),
            "approveRefund::Invalid Argument. Amount is greater than Available Balance."
        );

        totalRefunded = totalRefunded.add(value);

        emit LogRefundApproval(value, totalRefunded);
    }


    /*----------  Withdrawal Methods  ----------*/

    /**
     * @dev Withdraws portion of the contract's available balance.
     *      Amount donor receives is proportionate to their funding contribution.
     * @param donor Donor address to refund.
     * @return true if withdraw successful.
     */
    function withdrawRefund(address payable donor)
        public
        nonReentrant
        returns(bool)
    {

        uint256 percentContributed = donors[donor].funded
            .mul(ATOMIC_UNITS).div(
                totalFunding
            );

        // Donor's share of refund.
        uint256 eligibleRefund = totalRefunded
            .mul(percentContributed)
            .div(ATOMIC_UNITS);

        require(
            eligibleRefund >= donors[donor].refunded,
            "withdrawRefund::Error. Donor has already withdrawn eligible refund."
        );

        // Minus previous withdrawals.
        eligibleRefund = eligibleRefund.sub(donors[donor].refunded);

        // Update state.
        donors[donor].refunded = donors[donor].refunded.add(eligibleRefund);

        // Send funds.
        if (currency == address(0)) {
            require(
                // solium-disable-next-line security/no-send
                donor.send(eligibleRefund),
                "withdrawRefund::Transfer Error. Unable to send refundValue to Donor."
            );
        } else {
            require(
                IERC20(currency)
                    .transfer(donor, eligibleRefund),
                "withdrawRefund::Transfer Error. ERC20 token transfer failed."
            );
        }

        emit LogRefund(donor, eligibleRefund);

        return true;
    }

    /**
     * @dev Withdraws portion of the contract's available balance.
     *      Amount grantee receives is their total payoutApproved - totalPaid.
     * @param grantee Grantee address to refund.
     * @return true if withdraw successful.
     */
    function withdrawPayout(address payable grantee)
        public
        nonReentrant
        returns(bool)
    {

        // Amount to be paid.
        // Will throw if grantees[grantee].payoutApproved < grantees[grantee].totalPaid
        uint256 eligiblePayout = grantees[grantee].payoutApproved
            .sub(grantees[grantee].totalPaid);


        // Update state.
        grantees[grantee].totalPaid = grantees[grantee].totalPaid
            .add(eligiblePayout);

        // Send funds.
        if (currency == address(0)) {
            require(
                // solium-disable-next-line security/no-send
                grantee.send(eligiblePayout),
                "approvePayout::Transfer Error. Unable to send value to Grantee."
            );
        } else {
            require(
                IERC20(currency)
                    .transfer(grantee, eligiblePayout),
                "approvePayout::Transfer Error. ERC20 token transfer failed."
            );
        }

        emit LogPayment(grantee, eligiblePayout);
    }


    /*----------  Private Methods  ----------*/

    function fundWithEther(uint256 value, uint256 change)
        private
    {
        require(
            msg.value == value,
            "fundWithEther::Invalid Argument. value must equal msg.value."
        );

        require(
            msg.value > 0,
            "fundWithEther::Invalid Value. msg.value be greater than 0."
        );

        // Send change as refund.
        if (change > 0) {
            require(
                // solium-disable-next-line security/no-send
                msg.sender.send(change),
                "fundWithEther::Transfer Error. Unable to send change back to sender."
            );
        }
    }

    function fundWithToken(uint256 value, uint256 change)
        private
    {
        require(
            msg.value == 0,
            "fundWithToken::Currency Error. Cannot send Ether to a token funded grant."
        );

        // Subtract change before transferring to grant contract.
        uint256 netValue = value.sub(change);
        require(
            IERC20(currency)
                .transferFrom(msg.sender, address(this), netValue),
            "fund::Transfer Error. ERC20 token transferFrom failed."
        );
    }


    /*----------  Fallback  ----------*/

    function ()
        external
        payable
    {
        fund(msg.value);
    }
}
