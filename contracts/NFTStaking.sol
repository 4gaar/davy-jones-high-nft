// SPDX-License-Identifier: MIT LICENSE

pragma solidity ^0.8.4;

import "./DAVYRewards.sol";
import "./DAVYNFT.sol";
import "@prb/math/contracts/PRBMathUD60x18.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
// import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "@quant-finance/solidity-datetime/contracts/DateTime.sol";
import "hardhat/console.sol";

contract NFTStaking is Ownable, IERC721Receiver {
    using PRBMathUD60x18 for uint256;

    uint256 private _totalRewards = 500000000 ether;
    uint256 private _initalRewards = 500000 ether;
    uint256 private _totalPayouts = 0;
    uint256 private _contractStart;
    uint256[] private _stakedTokens;    

    // struct to store a stake's token and owner
    struct Stake {
        uint256 tokenId;
        address owner;
        uint256 rarity;
    }

    event PayeePayout(address owner, uint256 tokenId, uint256 payout);
    event TotalPayout(uint256 totalPayout, uint256 allocationForPeriod);
    event NFTStaked(address owner, uint256 tokenId, uint256 value);
    event NFTUnstaked(address owner, uint256 tokenId, uint256 value);
    event Claimed(address owner, uint256 amount);
    event EarningsForEra(
        int128 P0,
        int128 earnings,
        int128 exponent,
        int128 t,
        int128 k
    );

    // reference to the Block NFT contract
    DAVYNFT _nftContract;
    DAVYRewards _rewardsContract;

    // maps tokenId to stake
    mapping(uint256 => Stake) private _vault;

    mapping(address => uint256) private _payouts;

    constructor(DAVYNFT nftContract, DAVYRewards rewardsContract) {
        _nftContract = nftContract;
        _rewardsContract = rewardsContract;
        _contractStart = block.timestamp;
    }

    function stake(uint256[] calldata tokenIds) external {
        uint256 tokenId;
        uint256 rarity;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            require(
                _nftContract.ownerOf(tokenId) == msg.sender,
                "not your token"
            );
            require(tokenId > 0, "token ids must be greater than zero");
            require(_vault[tokenId].tokenId != tokenId, "already staked");

            rarity = _nftContract.getRarity(tokenId);

            _nftContract.transferFrom(msg.sender, address(this), tokenId);

            emit NFTStaked(msg.sender, tokenId, block.timestamp);

            _stakedTokens.push(tokenId);

            _vault[tokenId] = Stake({
                owner: msg.sender,
                tokenId: tokenId,
                rarity: rarity
            });
        }
    }

    function unstake(uint256[] calldata tokenIds) external {
        uint256 tokenId;

        _setPayouts();

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            Stake memory staked = _vault[tokenId];
            require(staked.owner == msg.sender, "not your token");

            _removeToken(tokenId);
            _nftContract.transferFrom(address(this), msg.sender, tokenId);

            delete _vault[tokenId];
        }
    }

    function _removeToken(uint256 tokenId) private {
        for (uint256 i; i < _stakedTokens.length; i++) {
            if (_stakedTokens[i] == tokenId) {
                _stakedTokens[i] = _stakedTokens[_stakedTokens.length - 1];
                _stakedTokens.pop();
                break;
            }
        }
    }

    function getContractStart() public view returns (uint256) {
        return _contractStart;
    }

    // rewards = P0  + P0 * k - P0 * k * exp(-t/k)
    //
    //  term1 = P0
    //  term2 = k * P0
    //  term3 = k * P0 * exp(-t/k)
    function _calculateEarnings(
        uint256 daysInEra,
        uint256 initialRewards,
        uint256 totalRewards
    ) private view returns (uint256) {
        uint256 t = daysInEra;
        uint256 PT = totalRewards;
        uint256 P0 = initialRewards;
        uint256 R = PT.div(P0);
        uint256 k = R - 1e18;
        uint256 payout = P0 + P0 * k - P0 * k.div((t * 1e18).div(k).exp());

        if (_totalPayouts >= payout) {            
            return 0;
        } else {           
            return payout - _totalPayouts;
        }
    }

    function calculateEarnings(
        uint256 daysInEra,
        uint256 initialRewards,
        uint256 totalRewards
    ) public view onlyOwner returns (uint256) {
        return _calculateEarnings(daysInEra, initialRewards, totalRewards);
    }
    
    function getEarningsForEra() public view returns (uint256) {
        uint256 daysInEra = DateTime.diffDays(_contractStart, block.timestamp);

        return _calculateEarnings(daysInEra, _initalRewards, _totalRewards);
    }

    // Calculates the linearized weight for index.
    function _calculatePayoutRatio(
        uint256 i,
        uint256 N,
        uint256 sum
    ) private pure returns (uint256) {
        uint256 weight = N - i;
        uint256 ratio = (weight * 1e18).div(sum * 1e18);

        return ratio;
    }

    function calculatePayoutRatio(
        uint256 i,
        uint256 N,
        uint256 sum
    ) public view onlyOwner returns (uint256) {
        return _calculatePayoutRatio(i, N, sum);
    }

    function _setPayouts() private {
        uint256[] memory tokenIds = _stakedTokens;
        uint256 tokenId;
        uint256 amount;
        uint256 payout;
        Stake memory staked;
        uint256 tokenCount = tokenIds.length;
        uint256 totalEarnings = getEarningsForEra();
        uint256 sum = 0;
        uint256 ratio;

        for (uint256 x = 1; x <= tokenCount; x++) {
            sum += x;
        }

        for (uint256 i = 0; i < tokenCount; i++) {
            ratio = _calculatePayoutRatio(i, tokenCount, sum);
            tokenId = tokenIds[i];
            staked = _vault[tokenId];
            amount = (staked.rarity * totalEarnings * ratio) / 1e18 / 1e4;
            _payouts[staked.owner] += uint256(amount);
            payout += amount;

            emit PayeePayout(staked.owner, tokenId, _payouts[staked.owner]);
        }

        _totalPayouts += payout;

        emit TotalPayout(payout, _totalPayouts);
    }

    function setPayouts() public onlyOwner {
        _setPayouts();
    }

    function getPayout() external view returns (uint256) {
        return _payouts[msg.sender];
    }

    function claim() public {
        uint256 amount = _payouts[msg.sender];

        if (amount > 0) {
            _rewardsContract.mint(msg.sender, amount);
        }

        delete _payouts[msg.sender];

        emit Claimed(msg.sender, amount);
    }

    function onERC721Received(
        address,
        address from,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        require(from == address(0x0), "Cannot send nfts to Vault directly");
        return IERC721Receiver.onERC721Received.selector;
    }

    function getTotalStaked() external view returns (uint256) {
        return _stakedTokens.length;
    }
}
