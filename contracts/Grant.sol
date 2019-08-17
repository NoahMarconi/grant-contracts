pragma solidity >=0.5.10 <0.6.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./AbstractGrant.sol";
import "./ISignal.sol";


/**
 * @title Grants Spec Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract Grant is AbstractGrant, ISignal {
    using SafeMath for uint256;


    /*----------  Constants  ----------*/

    uint256 PRECISION_D = 10 ** 18;


    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of unlocked funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     * @param _manager (Optional) Multisig or EOA address of grant manager.
     * @param _currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param _targetFunding (Optional) Funding threshold required to release funds.
     * @param _fundingExpiration (Optional) Date after which votes OR funds (dependant on GrantType) cannot be sent.
     * @param _contractExpiration (Optional) Date after which payouts must be complete or anyone can trigger refunds.
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
    {
        require(
        // solium-disable-next-line security/no-block-members
            _fundingExpiration == 0 || _fundingExpiration > now,
            "constructor::Invalid Argument. _fundingExpiration must be 0 or greater than current date."
        );

        require(
        // solium-disable-next-line security/no-block-members
            _contractExpiration == 0 || _contractExpiration > now,
            "constructor::Invalid Argument. _contractExpiration must be 0 or greater than current date."
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
        address lastAddress = address(0);
        for (uint256 i = 0; i < _grantees.length; i++) {
            address currentGrantee = _grantees[i];
            address currentAmount = _amounts[i];

            require(
                currentAmount > 0,
                "constructor::Invalid Argument. Grantee's allocation (currentAmount) must be greater than 0."
            );


            require(
                currentGrantee > lastAddress,
                "constructor::Invalid Argument. Grantee's address array must be duplicate free and sorted smallest to largest."
            );

            require(
                currentGrantee != _manager,
                "constructor::Invalid Argument. _manager cannot be a Grantee."
            );

            lastAddress = currentGrantee;
            grantees[currentGrantee].targetFunding = currentAmount;
        }

    }


    /*----------  Public Helpers  ----------*/

    function isGrantee(address toCheck)
        public
        view
        returns(bool)
    {
        return grantees[toCheck].totalFunded > 0;
    }

    function isDonor(address toCheck)
        public
        view
        returns(bool)
    {
        return donors[toCheck].funded > 0;
    }

    function isManager(address toCheck)
        public
        view
        returns(bool)
    {
        return manager == toCheck;
    }

    function contractBalance()
        public
        view
        returns(uint256)
    {
        return totalFunding.sub(totalPayed).sub(totalRefunded);
    }

    /*----------  Public Getters  ----------*/

    // TODO: are there additional getters needed?

    /**
     * @dev Donor Getter.
     * @param id GUID for the grant.
     * @param donor Address for the donor.
     * @return The Donor struct.
     */
    function getDonor(address donor)
        public
        view
        returns (Donor memory)
    {
        return donors[donor];
    }

    /**
     * @dev Grantee Getter.
     * @param grantee Address for the grantee.
     * @return The Grantee struct.
     */
    function getGrantee(address grantee)
        public
        view
        returns (Grantee memory)
    {
        return _grantees[grantee];
    }

    /**
     * @dev Manager Getter.
     * @return The manager address.
     */
    function getManager()
        public
        view
        returns (address)
    {
        return manager;
    }


    /*----------  Public Methods  ----------*/

    /**
     * @dev Fund a grant proposal.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Cumulative funding received for this grant.
     */
    function fund(uint256 value)
        public
        payable
        returns (uint256 balance)
    {

        require(
            grantStatus == GrantStatus.INIT,
            "fund::Status Error. Must be GrantStatus.INIT to fund."
        );

        require(
            // solium-disable-next-line security/no-block-members
            fundingExpiration > now,
            "fund::Date Error. fundingExpiration date has passed, cannot receive new donations."
        );

        uint256 newTotalFunding = totalFunding.add(value);

        uint256 change;
        if(newTotalFunding > targetFunding) {
            change = newTotalFunding.sub(targetFunding);
            newTotalFunding = targetFunding;
        }

        // Defer to correct funding method.
        if(currency == address(0)) {
            fundWithEther(value, change);
        } else {
            fundWithToken(value, change);
        }

        // Record Contribution.
        if (!isDonor(msg.sender)) {
            totalDonors = totalDonors.add(1);
        }
        donors[msg.sender].funded = donors[msg.sender].funded.add(value);

        // Update funding tally.
        totalFunding = newTotalFunding;

        // Log events.
        emit LogFunding(id, msg.sender, value);

        if (targetFunding == newTotalFunding) {
            grantStatus = GrantStatus.SUCCESS;
            emit LogStatusChange(GrantStatus.SUCCESS);
        }

        return newTotalFunding;
    }

    /**
     * @dev Pay a grantee.
     * @param id GUID for the grant to fund.
     * @param grantee Recipient of payment.
     * @param value Amount in WEI or GRAINS to fund.
     * @return Remaining funding available in this grant.
     */
    function payout(address grantee, uint256 value)
        public
        returns (uint256 balance)
    {

        require(
            grantStatus == GrantStatus.SUCCESS,
            "payout::Status Error. Must be GrantStatus.SUCCESS to issue payment."
        );

        require(
            isManager(msg.sender) || (isGrantee(msg.sender) && msg.sender == grantee),
            "payout::Invalid Argument. If not a Manger, msg.sender must match grantee argument."
        );

        // Overloaded function. Manager calling approves a payout,
        // Grantee calling withdraws payout.
        if (isManager(msg.sender)) {
            approvePayout(grantee, value);
        } else {
            withdrawPayout(grantee, value);
        }

        return contractBalance();
    }

    /**
     * @dev Refund a grantor.
     * @param donor Recipient of refund.
     * @param value Amount in WEI or GRAINS to fund.
     * @return True if successful, otherwise false.
     */
    function refund(address donor, uint256 value)
        public
        returns (uint256 balance)
    {
        // Overloaded function. Manager calling approves a refund,
        // Donor calling withdraws refund.
        if (isManager(msg.sender)) {
            approveRefund(donor, value);
        } else {
            withdrawRefund(donor, value);
        }

        return contractBalance();
    }

    /**
     * @dev Cancel grant and enable refunds.
     * @param id GUID for the grant to refund.
     * @return True if successful, otherwise false.
     */
    function cancelGrant()
        public
        returns (uint256 balance)
    {
        require(
            grantStatus == GrantStatus.SUCCESS ||
            grantStatus == GrantStatus.INIT,
            "cancelGrant::Status Error. Must be GrantStatus.INIT, GrantStatus.SUCCESS to cancel."
        );

        require(
            isManager(msg.sender),
            "cancelGrant::Invalid Sender. Only a Manager may cancel the grant."
        );

        grantStatus = GrantStatus.DONE;

        emit LogStatusChange(GrantStatus.DONE);

        return contractBalance();
    }

    /**
     * @dev Voting Signal Method.
     * @param id The ID of the grant to signal in favor for.
     * @param value Number of signals denoted in Token GRAINs or WEI.
     * @return True if successful, otherwise false.
     */
    function signal(uint256 value)
        external
        payable
        returns (bool)
    {

        require(
            grantStatus == GrantStatus.INIT,
            "signal::Status Error. Must be GrantStatus.INIT to signal."
        );

        emit LogSignal(msg.sender, currency, value);

        // Prove signaler has control of funds.
        if (currency == address(0)) {
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


    /*----------  Private Methods  ----------*/

    function fundWithEther(uint256 value, uint256 change)
        private
    {
        require(
            msg.value == value,
            "fundWithEther::Invalid Argument. value must equal msg.value. Consider using the fallback function for Ether donations."
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
        // Subtract change before transferring to grant contract.
        uint256 netValue = value.sub(change);
        require(
            IERC20(currency)
                .transferFrom(msg.sender, address(this), netValue),
            "fund::Transfer Error. ERC20 token transferFrom failed."
        );
    }

    function withdrawPayout(address grantee, uint256 value)
        private
    {
        require(
            msg.sender == grantee,
            "withdrawPayout::Invalid Argument. grantee must match msg.sender."
        );

        require(
            grantees[grantee].payoutApproved == value,
            "withdrawPayout::Invalid Argument. grantee payoutApproved does not match value."
        );

        // Update state.
        totalPayed = totalPayed.add(value);
        grantees[grantee].payoutApproved = 0;
        grantees[grantee].totalPayed = grantees[grantee].totalPayed.add(value);

        // Send funds.
        if (currency == address(0)) {
            require(
                // solium-disable-next-line security/no-send
                msg.sender.send(value),
                "withdrawPayout::Transfer Error. Unable to send value to Grantee."
            );
        } else {
            require(
                IERC20(currency)
                    .transfer(grantee, value),
                "withdrawPayout::Transfer Error. ERC20 token transfer failed."
            );
        }

        emit LogPayment(grantee, value);

    }

    function approvePayout(address grantee, uint256 value)
        private
    {

        uint256 remainingAllocation = grantees[grantee].targetFunding
            .sub(grantees[grantee].totalPayed)
            .sub(grantees[grantee].payoutApproved);

        require(
            remainingAllocation >= value,
            "approvePayout::Invalid Argument. value cannot exceed Grantee's remaining allocation."
        );

        grantees[grantee].payoutApproved = grantees[grantee]
            .payoutApproved.add(value);

        emit LogPaymentApproval(grantee, value);
    }

    function withdrawRefund(address donor, uint256 value)
        private
    {
        require(
            msg.sender == donor,
            "withdrawRefund::Invalid Argument. donor must match msg.sender."
        );

        // Handle self initiated refund.
        // May refund without Manager approval if:
        //     1. Funding goal not met before fundingExpiration.
        //     2. Funds not completely dispersed before contractExpiration.
        //     3. Manager cancelled grant.
        uint256 balance = contractBalance();
        uint245 refundValue = value;
        if (
            // solium-disable-next-line security/no-block-members
            (now >= fundingExpiration && totalFunding < targetFunding) ||
            grantStatus == GrantStatus.DONE ||
            (now >= contractExpiration && balance > 0)
            // solium-disable-previous-line security/no-block-members
        )
        {
            // Set GrantStatus to DONE to halt pending payouts.
            if (grantStatus != GrantStatus.DONE) {
                grantStatus = GrantStatus.DONE;
            }

            // Set balance checkpoint for self initiated refunds.
            if (refundCheckpoint == 0) {
                refundCheckpoint = totalRefunded;
            }

            // Calculate % of balance owned.
            uint256 base = totalFunding
                .sub(refundCheckpoint)
                .mul(PRECISION_D);

            uint256 numerator = donors[msg.sender].funded
                .mul(PRECISION_D);

            uint256 fundsRemaining = totalFunding
                .sub(refundCheckpoint)
                .sub(totalPayed);

            refundValue = numerator.mul(fundsRemaining).div(base);

        } else { // Handle Manager initiated refund.

            require(
                donors[donor].refundApproved == value,
                "withdrawPayout::Invalid Argument. donor refundApproved does not match value."
            );

        }

        // Update state.
        totalRefunded = totalRefunded.add(refundValue);
        donors[donor].refundApproved = 0;
        donors[donor].refunded = donors[donor].refunded.add(refundValue);

        // Send funds.
        if (currency == address(0)) {
            require(
                // solium-disable-next-line security/no-send
                msg.sender.send(refundValue),
                "withdrawRefund::Transfer Error. Unable to send refundValue to Donor."
            );
        } else {
            require(
                IERC20(currency)
                    .transfer(donor, refundValue),
                "withdrawRefund::Transfer Error. ERC20 token transfer failed."
            );
        }

        emit LogRefund(donor, refundValue);

    }

    function approveRefund(address donor, uint256 value)
        private
    {

        uint256 remainingAllocation = donors[donor].funded
            .sub(donors[donor].refunded)
            .sub(donors[donor].refundApproved);

        require(
            remainingAllocation >= value,
            "approvePayout::Invalid Argument. value cannot exceed Donor's remaining allocation."
        );

        donors[donor].refundApproved = donors[donor]
            .refundApproved.add(value);

        emit LogRefundApproval(donor, value);
    }



    /*----------  Fallback  ----------*/

    function ()
        public
        payable
    {
        fund(msg.value);
    }
}
