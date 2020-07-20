// SPDX-License-Identifier: MIT
pragma solidity >=0.6.8 <0.7.0;


/**
 * @title Grants Spec Abstract Contract.
 * @dev Grant request, funding, and management.
 * @author @NoahMarconi @ameensol @JFickel @ArnaudBrousseau
 */
abstract contract AbstractManager {

    /*----------  Globals  ----------*/

    address public manager;                      // Multisig or EOA address to manage grant.


    /*----------  Modifiers  ----------*/

    modifier onlyManager() {
        require(
            isManager(msg.sender),
            "onlyManager::Permission Error. Function can only be called by manager."
        );

        _;
    }


    /*----------  Public Helpers  ----------*/

    function requireManager()
        public
        view
    {
        require(
            isManager(msg.sender),
            "requireManager::Permission Error. Function can only be called by manager."
        );
    }

    function isManager(address toCheck)
        public
        view
        returns(bool)
    {
        return manager == toCheck;
    }


}