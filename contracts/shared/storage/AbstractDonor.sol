// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "../interfaces/IDonor.sol";

/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi
 */
abstract contract DonorTypes is IDonor {

    /*----------  Globals  ----------*/

    mapping(address => uint256) public donorFunded;     // Cumulative amount funded.
    mapping(address => uint256) public donorRefunded;   // Cumulative amount refunded.


}