// GET /api/tokens: what the server keeps of Connect's supported_tokens, `tokens` on Solana and `sources` on Base,
// Arbitrum and Ethereum, with the fields Connect sends. The ids are the real NEAR Intents ones.

export type Token = { assetId: string; symbol: string; blockchain: string; contractAddress?: string; decimals: number; price: number; priceUpdatedAt: string };

const updated = '2026-11-05T10:00:00.000Z';

export const SOL_USDC: Token = { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, price: 1, priceUpdatedAt: updated };
export const SOL_USDT: Token = { assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near', symbol: 'USDT', blockchain: 'sol', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, price: 1, priceUpdatedAt: updated };
/** SOL, with the wrapped mint as its contract so that it can be a recipe's target. */
export const SOL_WSOL: Token = { assetId: 'nep141:sol.omft.near', symbol: 'wSOL', blockchain: 'sol', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9, price: 160, priceUpdatedAt: updated };

export const BASE_USDC: Token = { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', blockchain: 'base', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, price: 1, priceUpdatedAt: updated };
export const BASE_ETH: Token = { assetId: 'nep141:base.omft.near', symbol: 'ETH', blockchain: 'base', decimals: 18, price: 3000, priceUpdatedAt: updated };
export const ARB_USDC: Token = { assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', symbol: 'USDC', blockchain: 'arb', contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, price: 1, priceUpdatedAt: updated };
export const ARB_ETH: Token = { assetId: 'nep141:arb.omft.near', symbol: 'ETH', blockchain: 'arb', decimals: 18, price: 3000, priceUpdatedAt: updated };
export const ETH_USDC: Token = { assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', symbol: 'USDC', blockchain: 'eth', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, price: 1, priceUpdatedAt: updated };
export const ETH_ETH: Token = { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 3000, priceUpdatedAt: updated };

export const TOKENS = { tokens: [SOL_USDC, SOL_USDT, SOL_WSOL], sources: [BASE_USDC, BASE_ETH, ARB_USDC, ARB_ETH, ETH_USDC, ETH_ETH] };

const all = [...TOKENS.tokens, ...TOKENS.sources];
export const tokenOf = (assetId: string) => all.find(token => token.assetId === assetId);
