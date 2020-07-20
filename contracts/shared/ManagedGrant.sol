// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;

import "./storage/AbstractManager.sol";


/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
contract ManagedGrant is AbstractManager {


    /*----------  Constructor  ----------*/

    constructor(
        address _manager
    )
        public
    {
        manager = _manager;
    }


}