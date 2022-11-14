// SPDX-License-Identifier: MIT LICENSE

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract DAVYRewards is ERC20, ERC20Burnable, Ownable {
    event ControllerAdded(address controller);

    mapping(address => bool) private _controllers;

    constructor() ERC20("Davy Jone's Locker rewards token", "DAVR") {}

    function mint(address to, uint256 amount) external {
        require(
            msg.sender == owner() || _controllers[msg.sender],
            "Only owners and controllers can mint."
        );

        _mint(to, amount);
    }

    function burn(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }

    function addController(address controller) external onlyOwner {
        _controllers[controller] = true;
        emit ControllerAdded(controller);
    }

    function removeController(address controller) external onlyOwner {
        delete _controllers[controller];
    }
}
