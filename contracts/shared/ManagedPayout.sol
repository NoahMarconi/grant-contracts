// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./interfaces/IManager.sol";
import "./AbstractGrantee.sol";
import "./Percentages.sol";


/**
 * @title Managed Payout Abstract Contract.
 * @dev Handles approval of grantee payouts.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract ManagedPayout is IManager, AbstractGrantee  {
    using SafeMath for uint256;

    /*----------  Events  ----------*/

    /**
     * @dev Manager approving a payment.
     * @param grantee Address receiving payment.
     * @param value Amount in WEI or ATOMIC_UNITS approved for payment.
     */
    event LogPaymentApproval(address indexed grantee, uint256 value);


    /*----------  Public Methods  ----------*/


    /**
     * @dev Approve payment to a grantee.
     * @param value Amount in WEI or ATOMIC_UNITS to approve.
     * @param grantee Recipient of payment.
     */
    function approvePayout(uint256 value, address grantee)
        public
        returns(bool)
    {

        this.requireManager();

        require(
            (targetFunding == 0 || targetFunding == totalFunding),
            "approvePayout::Status Error. Cannot approve if funding target not met."
        );

        require(
            (value > 0),
            "approvePayout::Value Error. Must be non-zero value."
        );

        require(
            !grantCancelled,
            "approvePayout::Status Error. Cannot approve if grant is cancelled."
        );

        if (percentageBased) {

            uint256 granteesMaxAllocation = Percentages.maxAllocation(
                grantees[grantee].targetFunding,
                cumulativeTargetFunding,
                totalFunding
            );

            require(
                granteesMaxAllocation >= value,
                "approvePayout::Invalid Argument. value cannot exceed granteesMaxAllocation."
            );

        } else {

            require(
                remainingAllocation(grantee) >= value,
                "approvePayout::Invalid Argument. value cannot exceed remaining allocation."
            );

        }


        // Update state.
        totalPaid = totalPaid.add(value);
        grantees[grantee].payoutApproved = grantees[grantee].payoutApproved.add(value);

        emit LogPaymentApproval(grantee, value);

        return true;
    }

}