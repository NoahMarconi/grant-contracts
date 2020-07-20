// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "./RefundableGrant.sol";
import "./interfaces/IManager.sol";

/**
 * @title Cancelable and Refundable Grant.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract CancelableRefundable is IManager, RefundableGrant  {

    /*----------  Events  ----------*/

    /**
     * @dev Grant cancellation event.
     */
    event LogGrantCancellation();


    /*----------  Public Methods  ----------*/

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
                /* solhint-disable not-rely-on-time */
                (fundingDeadline != 0 && fundingDeadline <= now && totalFunding < targetFunding) ||
                (contractExpiration != 0 && contractExpiration <= now),
                /* solhint-enable not-rely-on-time */
                "cancelGrant::Invalid Sender. Sender must be manager or expired."
            );
        }

        totalRefunded = totalRefunded.add(availableBalance());

        grantCancelled = true;

        emit LogGrantCancellation();
    }
}