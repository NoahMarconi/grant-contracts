// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/utils/ReentrancyGuard.sol";
import "./AbstractGrantee.sol";
import "./ITrustedToken.sol";

/**
 * @title Pull Payment Abstract Contract.
 * @dev Handles grantee withdrawal.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract PullPaymentGrant is ReentrancyGuard, AbstractGrantee {
    using SafeMath for uint256;

    /**
     * @dev Withdraws portion of the contract's available balance.
     *      Amount grantee receives is their total payoutApproved - totalPaid.
     * @param grantee Grantee address to refund.
     * @return true if withdraw successful.
     */
    function withdrawPayout(address payable grantee)
        public
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
        if (currency == address(0)) {
            require(
                // solhint-disable-next-line check-send-result
                grantee.send(eligiblePayout),
                "withdrawPayout::Transfer Error. Unable to send value to Grantee."
            );
        } else {
            require(
                ITrustedToken(currency)
                    .transfer(grantee, eligiblePayout),
                "withdrawPayout::Transfer Error. ERC20 token transfer failed."
            );
        }

        emit LogPayment(grantee, eligiblePayout);
    }

}