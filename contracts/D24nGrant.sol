// SPDX-License-Identifier: MIT

pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/utils/ReentrancyGuard.sol";
import "./AbstractGrant.sol";
import "./shared/Percentages.sol";
import "./shared/GranteeTypes.sol";

interface TrustedToken is IERC20 {
    function decimals() external view returns (uint8);
}

/**
 * @title Grant for d24n.
 * @dev Managed                     (y)
 *      Funding Deadline            (n)
 *      Contract expiry             (y)
 *      With Token                  (y)
 *      Percentage based allocation (y)
 * @author @NoahMarconi
 */
contract D24nGrant is AbstractGrant, ReentrancyGuard {
    using SafeMath for uint256;


    /*----------  Constants  ----------*/

    uint256 private constant ATOMIC_UNITS = 10 ** 18;


    /*----------  Global Variables  ----------*/

    address[] private granteeReference;      // Reference to grantee addresses to allow for allocation top up.
    uint256 private cumulativeTargetFunding; // denominator for calculating grantee's percentage.

    /*----------  Constructor  ----------*/

    /**
     * @dev Grant creation function. May be called by grantors, grantees, or any other relevant party.
     * @param _grantees Sorted recipients of unlocked funds.
     * @param _amounts Respective allocations for each Grantee (must follow sort order of _grantees).
     * @param _currency (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
     * @param _uri URI for additional (off-chain) grant details such as description, milestones, etc.
     * @param _extraData (Optional) Support for extensions to the Standard.
     */
    constructor(
        address[] memory _grantees,
        uint256[] memory _amounts,
        address _currency,
        bytes memory _uri,
        bytes memory _extraData
    )
        public
    {

        address _manager;               //  _manager Multisig or EOA address of grant manager.
        uint256 _contractExpiration;    //  _contractExpiration (Optional) Date after which payouts must be complete or anyone can trigger refunds.
        bool _percentageOrFixed;        //  _percentageOrFixed (Optional) Grantee targets are percentage based or fixed.
        (
            _manager,
            _contractExpiration,
            _percentageOrFixed
        ) = abi.decode(_extraData, (address, uint256, bool));

        require(
            _currency != address(0) && TrustedToken(_currency).decimals() == 18,
            "constructor::Invalid Argument. Token must have 18 decimal places."
        );

        require(
        // solhint-disable-next-line not-rely-on-time
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
        uri = _uri;
        manager = _manager;
        currency = _currency;
        contractExpiration = _contractExpiration;

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

            require(
                currentGrantee != address(0),
                "constructor::Invalid Argument. grantee address cannot be a ADDRESS_ZERO."
            );

            lastAddress = currentGrantee;
            grantees[currentGrantee].targetFunding = currentAmount;

            cumulativeTargetFunding = cumulativeTargetFunding.add(currentAmount);

            // Store address as reference.
            granteeReference.push(currentGrantee);
        }

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
        override
        view
        returns(uint256)
    {
        return totalFunding
            .sub(totalPaid)
            .sub(totalRefunded);
    }

    /**
     * @dev Funding status check. Can fund if grant is not cancelled.
     * @return true if can fund grant.
     */
    function canFund()
        public
        override
        view
        returns(bool)
    {
        return !grantCancelled;
    }


    /*----------  Public Methods  ----------*/

    /**
     * @dev Fund a grant proposal.
     * @param value Amount in WEI or ATOMIC_UNITS to fund.
     * @return Cumulative funding received for this grant.
     */
    function fund(uint256 value)
        public
        override
        nonReentrant // OpenZeppelin mutex due to sending change if over-funded.
        returns (bool)
    {

        require(
            canFund(),
            "fund::Status Error. Grant not open to funding."
        );

        require(
            !isManager(msg.sender),
            "fund::Permission Error. Grant Manager cannot fund."
        );

        require(
            grantees[msg.sender].targetFunding == 0,
            "fund::Permission Error. Grantee cannot fund."
        );

        // Record Contribution.
        donors[msg.sender].funded = donors[msg.sender].funded
            .add(value);

        // Update funding tally.
        totalFunding = totalFunding.add(value);

        // Defer to correct funding method.
        fundWithToken(value);

        // Log events.
        emit LogFunding(msg.sender, value);

        return true;
    }


    /*----------  Manager Methods  ----------*/

    /**
     * @dev Reduce a grantee's allocation by a specified value.
     * @param value Amount to reduce by.
     * @param grantee Grantee address to reduce allocation from.
     */
    function reduceAllocation(uint256 value, address grantee)
        public
        override
        onlyManager
    {

        require(
            grantees[grantee].targetFunding >= value,
            "reduceAllocation::Invalid Argument. value cannot exceed grantee's targetFunding."
        );

        grantees[grantee].targetFunding.sub(value);

        cumulativeTargetFunding = cumulativeTargetFunding.sub(value);

        emit LogAllocationReduction(grantee, value);

    }

    /**
     * @dev Approve payment to a grantee.
     * @param value Amount in WEI or ATOMIC_UNITS to approve.
     * @param grantee Recipient of payment.
     */
    function approvePayout(uint256 value, address grantee)
        public
        override
        onlyManager
        returns(bool)
    {

        require(
            (value > 0),
            "approvePayout::Value Error. Must be non-zero value."
        );

        require(
            !grantCancelled,
            "approvePayout::Status Error. Cannot approve if grant is cancelled."
        );

        uint256 granteesMaxAllocation = Percentages.maxAllocation(
            grantees[grantee].targetFunding,
            cumulativeTargetFunding,
            totalFunding
        );

        require(
            granteesMaxAllocation >= value,
            "approvePayout::Invalid Argument. value cannot exceed granteesMaxAllocation."
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
        override
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
                // solhint-disable-next-line not-rely-on-time
                (contractExpiration != 0 && contractExpiration <= now),
                "cancelGrant::Invalid Sender. Sender must be manager or contract must be expired."
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
     */
    function approveRefund(uint256 value) // solhint-disable-line no-unused-vars
        public
        override
        onlyManager
    {
        require(
            false,
            "approveRefund::Not Permitted. Partial Refunds not permitted if no targetFunding. cancelGrant instead."
        );
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
        override
        nonReentrant // OpenZeppelin mutex due to sending funds.
        returns(bool)
    {

        // Donor's share of refund.
        uint256 eligibleRefund = Percentages.maxAllocation(
            donors[donor].funded,
            totalFunding,
            totalRefunded
        );

        require(
            eligibleRefund > donors[donor].refunded,
            "withdrawRefund::Error. Donor has already withdrawn eligible refund."
        );

        // Minus previous withdrawals.
        eligibleRefund = eligibleRefund.sub(donors[donor].refunded);

        // Update state.
        donors[donor].refunded = donors[donor].refunded.add(eligibleRefund);

        // Send funds.
        require(
            TrustedToken(currency)
                .transfer(donor, eligibleRefund),
            "withdrawRefund::Transfer Error. ERC20 token transfer failed."
        );

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
        override
        nonReentrant // OpenZeppelin mutex due to sending funds.
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
        require(
            TrustedToken(currency)
                .transfer(grantee, eligiblePayout),
            "withdrawPayout::Transfer Error. ERC20 token transfer failed."
        );

        emit LogPayment(grantee, eligiblePayout);
    }


    /*----------  Private Methods  ----------*/

    function fundWithToken(uint256 value)
        private
    {
        require(
            msg.value == 0,
            "fundWithToken::Currency Error. Cannot send Ether to a token funded grant."
        );

        require(
            value > 0,
            "fundWithToken::::Invalid Value. value must be greater than 0."
        );

        require(
            TrustedToken(currency)
                .transferFrom(msg.sender, address(this), value),
            "fund::Transfer Error. ERC20 token transferFrom failed."
        );
    }

}
