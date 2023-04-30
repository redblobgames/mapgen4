// SFC32 random number generator, public domain code
// from https://github.com/bryc/code/blob/master/jshash/PRNGs.md
export function makeRandFloat(seed: number): () => number {
    let a = 0, b = seed, c = 0, d = 1;
    function sfc32() {
        a |= 0; b |= 0; c |= 0; d |= 0; 
        var t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = c << 21 | c >>> 11;
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 12; i++) sfc32(); // scramble the seed
    return sfc32;
}
