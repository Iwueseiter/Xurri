// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {XurriPlays} from "../src/XurriPlays.sol";

/// @notice Deploys XurriPlays. It has no settings and no owner.
///   forge script script/DeployPlays.s.sol --tc DeployPlays --rpc-url celo --broadcast
contract DeployPlays is Script {
    function run() external returns (XurriPlays plays) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        plays = new XurriPlays();
        vm.stopBroadcast();
        console2.log("XurriPlays       ", address(plays));
    }
}
