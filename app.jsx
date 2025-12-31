import React, { useState, useEffect, useRef } from 'react';
import { Wallet, Car, Trophy, Zap, Flag, AlertCircle } from 'lucide-react';

export default function CryptoRacer() {
  const [account, setAccount] = useState(null);
  const [network, setNetwork] = useState(null);
  const [hasPaid, setHasPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [txHash, setTxHash] = useState(null);
  
  // Game state
  const [carPosition, setCarPosition] = useState(50);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [obstacles, setObstacles] = useState([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  
  const gameLoopRef = useRef(null);
  const keysPressed = useRef({});

  // GenLayer Asimov Testnet Configuration
  const GAME_CONFIG = {
    chainId: '0x107d', // 4221 in hex
    chainName: 'GenLayer Asimov Testnet',
    rpcUrl: 'https://genlayer-testnet.rpc.caldera.xyz/http',
    blockExplorer: 'https://genlayer-testnet.explorer.caldera.xyz',
    currency: 'GEN',
    entryFee: '0.001',
    contractAddress: '0x78B212F2081468aFEE03F6c7f0b32f8E1aA12aFC'
  };

  useEffect(() => {
    loadGameData();
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (gameActive && !gameOver) {
      gameLoopRef.current = setInterval(gameLoop, 50);
      return () => clearInterval(gameLoopRef.current);
    }
  }, [gameActive, gameOver, carPosition, obstacles, speed]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }
      keysPressed.current[e.key] = true;
    };
    
    const handleKeyUp = (e) => {
      keysPressed.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const loadGameData = async () => {
    try {
      const data = await window.storage.get('racing-best-score');
      if (data) {
        setBestScore(parseInt(data.value));
      }
    } catch (error) {
      console.log('No saved score');
    }
  };

  const loadLeaderboard = async () => {
    try {
      const keys = await window.storage.list('racer:', true);
      if (keys && keys.keys) {
        const entries = await Promise.all(
          keys.keys.map(async key => {
            try {
              const data = await window.storage.get(key, true);
              return data ? JSON.parse(data.value) : null;
            } catch {
              return null;
            }
          })
        );
        const validEntries = entries.filter(e => e).sort((a, b) => b.score - a.score);
        setLeaderboard(validEntries.slice(0, 10));
      }
    } catch (error) {
      console.log('Loading leaderboard...');
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask or another Web3 wallet to play!');
      return;
    }

    try {
      setIsProcessing(true);
      
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      setAccount(accounts[0]);
      
      const chainId = await window.ethereum.request({ 
        method: 'eth_chainId' 
      });
      
      // Check if on correct network
      if (chainId !== GAME_CONFIG.chainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: GAME_CONFIG.chainId }],
          });
        } catch (switchError) {
          // Chain doesn't exist, try to add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: GAME_CONFIG.chainId,
                chainName: GAME_CONFIG.chainName,
                rpcUrls: [GAME_CONFIG.rpcUrl],
                blockExplorerUrls: [GAME_CONFIG.blockExplorer],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }
      
      setNetwork(GAME_CONFIG.chainName);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setIsProcessing(false);
      alert('Failed to connect wallet. Please try again.');
    }
  };

  const payEntryFee = async () => {
    if (!account) {
      alert('Please connect your wallet first!');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Convert entry fee to wei (18 decimals)
      const entryFeeWei = Math.floor(parseFloat(GAME_CONFIG.entryFee) * 1e18);
      const weiValue = '0x' + entryFeeWei.toString(16);
      
      console.log('Payment Details:', {
        from: account,
        to: GAME_CONFIG.contractAddress,
        value: weiValue,
        valueInGEN: GAME_CONFIG.entryFee
      });
      
      // Estimate gas first
      let gasEstimate;
      try {
        gasEstimate = await window.ethereum.request({
          method: 'eth_estimateGas',
          params: [{
            from: account,
            to: GAME_CONFIG.contractAddress,
            value: weiValue,
            data: '0x' // Empty data, calling payToPlay through default/fallback
          }]
        });
        console.log('Gas estimate:', gasEstimate);
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError);
        // Use a higher default gas limit
        gasEstimate = '0x186A0'; // 100000 in hex
      }
      
      // Add 20% buffer to gas estimate
      const gasLimit = '0x' + Math.floor(parseInt(gasEstimate, 16) * 1.2).toString(16);
      
      // Call the payToPlay function directly
      const payToPlayData = '0x149c4bca'; // Function signature for payToPlay()
      
      const transactionParameters = {
        from: account,
        to: GAME_CONFIG.contractAddress,
        value: weiValue,
        gas: gasLimit,
        data: payToPlayData
      };

      console.log('Sending transaction:', transactionParameters);

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters],
      });
      
      console.log('Transaction sent:', txHash);
      
      setTxHash(txHash);
      setHasPaid(true);
      setIsProcessing(false);
      
      // Save payment status
      try {
        await window.storage.set(`payment:${account}`, JSON.stringify({
          txHash,
          timestamp: Date.now(),
          amount: GAME_CONFIG.entryFee
        }));
      } catch (storageError) {
        console.log('Storage save failed, but payment succeeded');
      }
      
      alert('Payment successful! You can now play the game. Transaction: ' + txHash.slice(0, 10) + '...');
    } catch (error) {
      console.error('Payment failed:', error);
      setIsProcessing(false);
      
      let errorMessage = 'Payment failed. ';
      
      if (error.code === 4001) {
        errorMessage = 'Transaction rejected by user.';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Please check: 1) You have enough GEN for gas + entry fee, 2) You are on GenLayer testnet, 3) Contract is deployed correctly';
      }
      
      alert(errorMessage);
    }
  };

  const startGame = () => {
    if (!hasPaid) {
      alert('Please pay the entry fee first!');
      return;
    }
    
    setGameActive(true);
    setGameOver(false);
    setCarPosition(50);
    setSpeed(0);
    setDistance(0);
    setScore(0);
    setObstacles([]);
    
    // Generate initial obstacles
    for (let i = 0; i < 3; i++) {
      addObstacle(i * 300);
    }
  };

  const addObstacle = (yOffset = 0) => {
    const lanes = [20, 50, 80];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    setObstacles(prev => [...prev, { x: lane, y: -100 - yOffset, id: Date.now() + Math.random() }]);
  };

  const gameLoop = () => {
    // Handle input
    let newCarPosition = carPosition;
    let newSpeed = speed;
    
    if (keysPressed.current['ArrowLeft']) {
      newCarPosition = Math.max(20, carPosition - 3);
    }
    if (keysPressed.current['ArrowRight']) {
      newCarPosition = Math.min(80, carPosition + 3);
    }
    if (keysPressed.current['ArrowUp']) {
      newSpeed = Math.min(15, speed + 0.5);
    }
    if (keysPressed.current['ArrowDown']) {
      newSpeed = Math.max(3, speed - 0.5);
    }
    
    // Auto-acceleration
    if (!keysPressed.current['ArrowUp'] && !keysPressed.current['ArrowDown']) {
      newSpeed = Math.min(10, speed + 0.1);
    }
    
    setCarPosition(newCarPosition);
    setSpeed(newSpeed);
    setDistance(prev => prev + newSpeed);
    setScore(prev => prev + Math.floor(newSpeed));
    
    // Move obstacles
    setObstacles(prev => {
      const moved = prev.map(obs => ({
        ...obs,
        y: obs.y + newSpeed
      })).filter(obs => obs.y < 600);
      
      // Add new obstacles
      if (moved.length < 5 && Math.random() > 0.95) {
        moved.push({
          x: [20, 50, 80][Math.floor(Math.random() * 3)],
          y: -50,
          id: Date.now() + Math.random()
        });
      }
      
      return moved;
    });
    
    // Check collisions
    obstacles.forEach(obs => {
      if (obs.y > 350 && obs.y < 450 && Math.abs(obs.x - newCarPosition) < 10) {
        endGame();
      }
    });
  };

  const endGame = async () => {
    setGameOver(true);
    setGameActive(false);
    
    if (score > bestScore) {
      setBestScore(score);
      try {
        await window.storage.set('racing-best-score', score.toString());
      } catch (error) {
        console.log('Failed to save score');
      }
    }
    
    // Submit to leaderboard
    if (account) {
      try {
        const shortAddr = `${account.slice(0, 6)}...${account.slice(-4)}`;
        await window.storage.set(
          `racer:${account}`,
          JSON.stringify({
            address: shortAddr,
            score: score,
            timestamp: Date.now()
          }),
          true
        );
        await loadLeaderboard();
      } catch (error) {
        console.log('Failed to submit score');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900 to-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 mb-4 border border-purple-500/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent flex items-center gap-3">
                <Car className="w-8 h-8 text-purple-400" />
                Crypto Racer
              </h1>
              <p className="text-gray-400 text-sm mt-1">Web3 Racing Game • Pay to Play</p>
            </div>
            
            {!account ? (
              <button
                onClick={connectWallet}
                disabled={isProcessing}
                className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <Wallet className="w-5 h-5" />
                {isProcessing ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : (
              <div className="text-right">
                <div className="text-sm text-gray-400">Connected</div>
                <div className="font-mono text-sm text-purple-400">{account.slice(0, 6)}...{account.slice(-4)}</div>
                <div className="text-xs text-green-400">{network}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Game Area */}
          <div className="md:col-span-2 space-y-4">
            {/* Payment Section */}
            {account && !hasPaid && (
              <div className="bg-yellow-500/10 border-2 border-yellow-500 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-yellow-400 mb-2">Entry Fee Required</h3>
                    <p className="text-gray-300 mb-4">
                      Pay <span className="font-bold text-yellow-400">{GAME_CONFIG.entryFee} {GAME_CONFIG.currency}</span> to unlock the game and compete on the leaderboard!
                    </p>
                    <button
                      onClick={payEntryFee}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 px-8 py-3 rounded-lg font-bold transition-all disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : `Pay ${GAME_CONFIG.entryFee} ${GAME_CONFIG.currency}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Confirmation */}
            {txHash && (
              <div className="bg-green-500/10 border border-green-500 rounded-lg p-4">
                <div className="text-sm">
                  <span className="text-green-400 font-bold">Payment Confirmed!</span>
                  <br />
                  <span className="text-gray-400">TX: </span>
                  <a 
                    href={`${GAME_CONFIG.blockExplorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 font-mono text-xs"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)}
                  </a>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-gray-400 text-sm">Score</div>
                  <div className="text-2xl font-bold text-yellow-400">{score}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Speed</div>
                  <div className="text-2xl font-bold text-green-400">{Math.floor(speed * 10)} km/h</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm">Best</div>
                  <div className="text-2xl font-bold text-purple-400">{bestScore}</div>
                </div>
              </div>
            </div>

            {/* Game Canvas */}
            <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30">
              <div className="relative w-full h-[500px] bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden">
                {/* Road */}
                <div className="absolute inset-0 flex justify-center">
                  <div className="relative w-full max-w-md bg-gray-700">
                    {/* Road lines */}
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-1/2 w-2 h-16 bg-white -translate-x-1/2"
                        style={{
                          top: `${i * 10 - (distance % 100)}%`,
                          opacity: 0.5
                        }}
                      />
                    ))}
                    
                    {/* Lane markers */}
                    <div className="absolute left-1/3 top-0 w-1 h-full bg-yellow-400/30" />
                    <div className="absolute left-2/3 top-0 w-1 h-full bg-yellow-400/30" />
                    
                    {/* Obstacles */}
                    {obstacles.map(obs => (
                      <div
                        key={obs.id}
                        className="absolute w-12 h-12 bg-red-600 rounded transition-all"
                        style={{
                          left: `${obs.x}%`,
                          top: `${obs.y}px`,
                          transform: 'translate(-50%, -50%)'
                        }}
                      >
                        <div className="w-full h-full flex items-center justify-center text-2xl">
                          🚧
                        </div>
                      </div>
                    ))}
                    
                    {/* Player Car */}
                    <div
                      className="absolute w-12 h-16 transition-all duration-100"
                      style={{
                        left: `${carPosition}%`,
                        top: '400px',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        🏎️
                      </div>
                    </div>
                  </div>
                </div>

                {/* Game Over Overlay */}
                {gameOver && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center">
                      <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                      <h2 className="text-4xl font-bold text-red-500 mb-2">Game Over!</h2>
                      <p className="text-2xl text-yellow-400 mb-6">Score: {score}</p>
                      {score > bestScore - 10 && (
                        <p className="text-green-400 mb-4">🎉 New Personal Best!</p>
                      )}
                      <button
                        onClick={startGame}
                        className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 px-8 py-3 rounded-lg font-bold transition-all"
                      >
                        Play Again
                      </button>
                    </div>
                  </div>
                )}

                {/* Start Screen */}
                {!gameActive && !gameOver && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center">
                      <Flag className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                      <h2 className="text-3xl font-bold mb-4">Ready to Race?</h2>
                      <p className="text-gray-300 mb-2">Use Arrow Keys to Control</p>
                      <p className="text-sm text-gray-400 mb-6">
                        ← → to steer, ↑ ↓ for speed
                      </p>
                      <button
                        onClick={startGame}
                        disabled={!hasPaid}
                        className={`px-8 py-4 rounded-lg font-bold text-xl transition-all ${
                          hasPaid
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
                            : 'bg-gray-600 cursor-not-allowed opacity-50'
                        }`}
                      >
                        {hasPaid ? 'Start Race!' : 'Pay to Play'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls Info */}
            <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Controls
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded">←</kbd>
                  <span className="text-gray-400">Move Left</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded">→</kbd>
                  <span className="text-gray-400">Move Right</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded">↑</kbd>
                  <span className="text-gray-400">Speed Up</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded">↓</kbd>
                  <span className="text-gray-400">Slow Down</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Network Info */}
            <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30">
              <h3 className="font-bold mb-3">Network Info</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-400">Chain:</span>
                  <div className="text-purple-400 font-mono text-xs">{GAME_CONFIG.chainName}</div>
                </div>
                <div>
                  <span className="text-gray-400">Entry Fee:</span>
                  <div className="text-yellow-400 font-bold">{GAME_CONFIG.entryFee} {GAME_CONFIG.currency}</div>
                </div>
                <div>
                  <span className="text-gray-400">Status:</span>
                  <div className={hasPaid ? 'text-green-400' : 'text-red-400'}>
                    {hasPaid ? '✓ Paid' : '✗ Not Paid'}
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-black/50 backdrop-blur-sm rounded-lg p-4 border border-purple-500/30">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Leaderboard
              </h3>
              <div className="space-y-2">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry, i) => (
                    <div key={i} className="bg-white/5 rounded p-2 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${i < 3 ? 'text-yellow-400' : 'text-gray-400'}`}>
                          #{i + 1}
                        </span>
                        <span className="font-mono text-xs">{entry.address}</span>
                      </div>
                      <span className="font-bold text-purple-400">{entry.score.toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-400 py-4 text-sm">
                    No scores yet. Be the first!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}