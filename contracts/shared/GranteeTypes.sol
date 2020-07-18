// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract GranteeTypes {

    /*----------  Globals  ----------*/

    mapping(address => Grantee) public grantees; // Grant recipients by address.
    address[] public granteeReference;           // Reference to grantee addresses to allow for iterating over grantees.
    uint256 public cumulativeTargetFunding;      // Denominator for calculating grantee's percentage.

    /*----------  Types  ----------*/

    struct Grantee {
        uint256 targetFunding;   // Funding amount targeted for Grantee.
        uint256 totalPaid;       // Cumulative funding received by Grantee.
        uint256 payoutApproved;  // Pending payout approved by Manager.
    }
}