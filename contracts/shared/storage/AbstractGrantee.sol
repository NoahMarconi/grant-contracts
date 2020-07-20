// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "../interfaces/IGrantee.sol";


/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract GranteeTypes is IGrantee {

    /*----------  Globals  ----------*/

    mapping(address => Grantee) public grantees; // Grant recipients by address.
    address[] public granteeReference;           // Reference to grantee addresses to allow for iterating over grantees.
    uint256 public cumulativeTargetFunding;      // Denominator for calculating grantee's percentage.
    bool percentageBased = false;    // Grantee amounts are percentage based (if true) or fixed (if false).

}