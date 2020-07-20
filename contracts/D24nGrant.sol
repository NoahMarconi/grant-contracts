// SPDX-License-Identifier: MIT

pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./shared/Percentages.sol";
import "./shared/GranteeConstructor.sol";
import "./shared/CancelableRefundable.sol";
import "./shared/ManagedPayout.sol";
import "./shared/FundGrant.sol";
import "./shared/ManagedRefund.sol";
import "./shared/PullPaymentGrant.sol";
import "./shared/ManagedAllocation.sol";
import "./shared/interfaces/ITrustedToken.sol";


/**
 * @title Grant for d24n.
 * @dev Managed                     (y)
 *      Funding Deadline            (n)
 *      Contract expiry             (y)
 *      With Token                  (y)
 *      Percentage based allocation (y)
 * @author @NoahMarconi
 */
contract D24nGrant is PullPaymentGrant, GranteeConstructor, ManagedAllocation, ManagedPayout, ManagedRefund, CancelableRefundable {
    using SafeMath for uint256;

    /*----------  Global Variables  ----------*/

    bool fundingActive = true;               // When false new funding is rejected.


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
        GranteeConstructor(_grantees, _amounts, false)
    {

        address _manager;               //  _manager Multisig or EOA address of grant manager.
        uint256 _contractExpiration;    //  _contractExpiration Date after which payouts must be complete or anyone can trigger refunds.
        bool _percentageOrFixed;        //  _percentageOrFixed Grantee targets are percentage based or fixed.
        (
            _manager,
            _contractExpiration,
            _percentageOrFixed
        ) = abi.decode(_extraData, (address, uint256, bool));

        require(
            _currency != address(0) && ITrustedToken(_currency).decimals() == 18,
            "constructor::Invalid Argument. Token must have 18 decimal places."
        );

        require(
            // solhint-disable-next-line not-rely-on-time
            _contractExpiration != 0 && _contractExpiration > now,
            "constructor::Invalid Argument. _contractExpiration not > now."
        );


        // Initialize globals.
        uri = _uri;
        manager = _manager;
        currency = _currency;
        contractExpiration = _contractExpiration;

    }


    /*----------  Public Helpers  ----------*/

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
            // solhint-disable-next-line not-rely-on-time
            (fundingDeadline == 0 || fundingDeadline > now) &&
            (targetFunding == 0 || totalFunding < targetFunding) &&
            fundingActive &&
            !grantCancelled
        );
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

        require(
            !isManager(msg.sender),
            "fund::Permission Error. Grant Manager cannot fund."
        );

        require(
            grantees[msg.sender].targetFunding == 0,
            "fund::Permission Error. Grantee cannot fund."
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
            "fundWithEther::Invalid Value. msg.value must be greater than 0."
        );

        // Send change as refund.
        if (change > 0) {
            require(
                // solhint-disable-next-line check-send-result
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

        require(
            value > 0,
            "fundWithToken::::Invalid Value. value must be greater than 0."
        );

        // Subtract change before transferring to grant contract.
        uint256 netValue = value.sub(change);
        require(
            ITrustedToken(currency)
                .transferFrom(msg.sender, address(this), netValue),
            "fund::Transfer Error. ERC20 token transferFrom failed."
        );
    }
}
