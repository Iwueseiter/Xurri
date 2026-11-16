// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title XurriPlays
/// @notice Records a game start for anyone who pays the network fee. The Xurri server only saves a
/// score when it can match the game to a `GamePlayed` event from the player's own wallet, so every
/// saved score is backed by an on-chain transaction.
///
/// No limits, no face check, no owner and no funds: there is nothing here to manage or steal. Prize
/// rules (face check, daily limits) stay in XurriTournaments.
contract XurriPlays {
    /// @notice Games started by each wallet, ever.
    mapping(address player => uint256) public gamesOf;
    uint256 public totalGames;

    event GamePlayed(address indexed player, uint256 gameNumber, uint64 day);

    function startGame() external returns (uint256 gameNumber) {
        gameNumber = ++gamesOf[msg.sender];
        totalGames += 1;
        emit GamePlayed(msg.sender, gameNumber, uint64(block.timestamp / 1 days));
    }
}
