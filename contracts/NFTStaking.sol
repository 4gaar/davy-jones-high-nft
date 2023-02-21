// SPDX-License-Identifier: MIT LICENSE

pragma solidity ^0.8.4;

import "./DAVYRewards.sol";
import "./DAVYNFT.sol";
import "@prb/math/contracts/PRBMathUD60x18.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@quant-finance/solidity-datetime/contracts/DateTime.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract NFTStaking is Ownable, IERC721Receiver {
    using PRBMathUD60x18 for uint256;

    uint256 private _totalRewards = 500000000 ether;
    uint256 private _initalRewards = 500000 ether;
    uint256 private _totalPayouts = 0;
    uint256 private _contractStart;
    uint256[] private _stakedTokens;
    uint256 private _timeMultiplier = 1e4; // remove after testing

    // struct to store a stake's token and owner
    struct Stake {
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

    // maps wallet to payout
    mapping(address => uint256) private _payouts;

    // tracks staked tokens
    // mapping(uint256 => bool) private _tokenIsStaked;

    constructor(DAVYNFT nftContract, DAVYRewards rewardsContract) {
        _nftContract = nftContract;
        _rewardsContract = rewardsContract;
        _contractStart = block.timestamp;
    }

    // remove after testing
    function getTotalRewards() public view returns (uint256) {
        return _totalRewards;
    }

    // remove after testing
    function getInitialRewards() public view returns (uint256) {
        return _initalRewards;
    }

    // remove after testing
    function getTotalPayous() public view returns (uint256) {
        return _totalPayouts;
    }

    // remove after testing
    function getContractStart() public view returns (uint256) {
        return _contractStart;
    }

    // remove after testing
    function getStakedTokens() public view returns (uint256[] memory) {
        return _stakedTokens;
    }

    // remove after testing
    function setTimeMultiplier(uint256 multiplier) public {
        _timeMultiplier = multiplier;
    }

    function stake(uint256[] calldata tokenIds) external {
        uint256 tokenId;
        uint256 rarity;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            require(_senderIsNftOwner(tokenId), "Not your token.");
            require(tokenId > 0, "Token ids must be greater than zero.");
            require(!_isStaked(tokenId), "The token is already staked.");

            rarity = _nftContract.getRarity(tokenId);
            _nftContract.safeTransferFrom(msg.sender, address(this), tokenId);

            emit NFTStaked(msg.sender, tokenId, block.timestamp);

            _stakedTokens.push(tokenId);
            _vault[tokenId] = Stake({owner: msg.sender, rarity: rarity});
        }
    }

    function _getSender() public view returns (address) {
        return msg.sender;
    }

    function _getNftOwner(uint256 tokenId) public view returns (address) {
        return _nftContract.ownerOf(tokenId);
    }

    function _senderIsNftOwner(uint256 tokenId) public view returns (bool) {
        return _getNftOwner(tokenId) == msg.sender;
    }

    function _isStaked(uint256 tokenId) public view returns (bool) {
        return _vault[tokenId].owner != address(0);
    }

    function unstake(uint256[] calldata tokenIds) external {
        uint256 tokenId;

        _setPayouts();

        for (uint256 i = 0; i < tokenIds.length; i++) {
            tokenId = tokenIds[i];
            Stake memory staked = _vault[tokenId];
            require(staked.owner == msg.sender, "not your token");

            _removeToken(tokenId);

            _nftContract.safeTransferFrom(address(this), msg.sender, tokenId);

            delete _vault[tokenId];
        }
    }

    function _orderStakedTokens(uint256 index) public {
        for (uint256 i = index; i < _stakedTokens.length - 1; i++) {
            _stakedTokens[i] = _stakedTokens[i + 1];
        }

        _stakedTokens.pop();
    }

    function _removeToken(uint256 tokenId) private {
        uint256 index = 0;

        for (uint256 i = 0; i < _stakedTokens.length; i++) {
            if (_stakedTokens[i] == tokenId) {
                index = i;
                break;
            }
        }

        if (index > 0) {
            _orderStakedTokens(index);
        }
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
        uint256 t = PRBMathUD60x18.fromUint(daysInEra);
        uint256 PT = PRBMathUD60x18.fromUint(totalRewards);
        uint256 P0 = PRBMathUD60x18.fromUint(initialRewards);
        uint256 R = PT.div(P0);
        uint256 k = R - 1e18;
        uint256 payout = PRBMathUD60x18.toUint(
            P0 + P0 * k - P0 * k.div((t).div(k).exp())
        );

        // console.log("payout:", payout);

        if (_totalPayouts >= payout) {
            return 0;
        } else {
            return payout - _totalPayouts;
        }
    }

    // Make 'onlyOwner' after testing is complete.
    function calculateEarnings(
        uint256 daysInEra,
        uint256 initialRewards,
        uint256 totalRewards
    ) public view returns (uint256) {
        return _calculateEarnings(daysInEra, initialRewards, totalRewards);
    }

    function getDaysInEra() public view returns (uint256) {
        return
            DateTime.diffDays(
                _contractStart,
                (block.timestamp * _timeMultiplier) / 1e4
            );
    }

    function getEarningsForEra() public view returns (uint256) {
        return
            _calculateEarnings(getDaysInEra(), _initalRewards, _totalRewards);
    }

    // Calculates the linearized weight for index.
    // (2*N - 2*i)/(N + N^2)
    function _calculatePayoutRatio(
        uint256 i,
        uint256 N
    ) private pure returns (uint256) {
        uint256 numerator = PRBMathUD60x18.fromUint(2 * N - 2 * i);
        uint256 denominator = PRBMathUD60x18.fromUint(N + N * N);

        return numerator.div(denominator);
    }

    // Make 'onlyOwner' after testing is complete.
    function calculatePayoutRatio(
        uint256 i,
        uint256 N
    ) public pure returns (uint256) {
        return _calculatePayoutRatio(i, N);
    }

    function _setPayouts() private {
        uint256[] memory tokenIds = _stakedTokens;
        uint256 tokenId;
        uint256 amount;
        uint256 payout;
        Stake memory staked;
        uint256 tokenCount = tokenIds.length;
        uint256 totalEarnings = getEarningsForEra();
        uint256 ratio;

        for (uint256 i = 0; i < tokenCount; i++) {
            ratio = _calculatePayoutRatio(i, tokenCount);
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

    // Make 'onlyOwner' after testing is complete.
    function setPayouts() public {
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

// TODO: can this being hardened?
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        
        // require (from == address(this), "Cannot send nfts to Vault directly");
        return IERC721Receiver.onERC721Received.selector;
    }

    function getTotalStaked() external view returns (uint256) {
        return _stakedTokens.length;
    }
}
