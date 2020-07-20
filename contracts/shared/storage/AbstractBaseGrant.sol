// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract AbstractBaseGrant {

    /*----------  Globals  ----------*/

    /* solhint-disable max-line-length */
    bytes public uri;                            // URI for additional (off-chain) grant details such as description, milestones, etc.
    address public currency;                     // (Optional) If null, amount is in wei, otherwise address of ERC20-compliant contract.
    uint256 public targetFunding;                // (Optional) Funding threshold required to begin releasing funds.
    uint256 public totalPaid;                    // Cumulative funding paid to grantees.
    uint256 public totalFunding;                 // Cumulative funding donated by donors.
    uint256 public fundingDeadline;              // (Optional) Date after which signal OR funds cannot be sent.
    uint256 public contractExpiration;           // (Optional) Date after which payouts must be complete or anyone can trigger refunds.
    bool public grantCancelled;                  // Flag to indicate when grant is cancelled.
    /* solhint-enable max-line-length */


}
