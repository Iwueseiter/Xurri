// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XurriPlays} from "../src/XurriPlays.sol";

contract XurriPlaysTest is Test {
    XurriPlays plays = new XurriPlays();

    function test_anyoneCanPlayAsOftenAsTheyLike() public {
        address player = makeAddr("player");
        for (uint256 i = 1; i <= 60; i++) {
            vm.prank(player);
            assertEq(plays.startGame(), i);
        }
        assertEq(plays.gamesOf(player), 60);
        assertEq(plays.totalGames(), 60);
    }

    function test_emitsTheGameForTheCaller() public {
        address player = makeAddr("player");
        uint256 now_ = 1_794_484_800;
        vm.warp(now_);
        vm.expectEmit(true, false, false, true);
        emit XurriPlays.GamePlayed(player, 1, uint64(now_ / 1 days));
        vm.prank(player);
        plays.startGame();
    }

    function test_countsArePerWallet() public {
        vm.prank(makeAddr("a"));
        plays.startGame();
        vm.prank(makeAddr("b"));
        plays.startGame();
        assertEq(plays.gamesOf(makeAddr("a")), 1);
        assertEq(plays.totalGames(), 2);
    }
}
