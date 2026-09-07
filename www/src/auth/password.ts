import type { BetterAuthOptions } from "better-auth/minimal"

const iterations = 100000
const toHex = (buffer: ArrayBuffer) =>
    [...new Uint8Array(buffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")

const fromHex = (hex: string) => {
    const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
    out.set(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
    return out
}

const derive = async (
    password: string,
    salt: Uint8Array<ArrayBuffer>
) => {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    )
    return crypto.subtle.deriveBits(
        { hash: "SHA-512", iterations, name: "PBKDF2", salt },
        key,
        512
    )
}

const hashPassword = async (password: string) => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const derived = await derive(password, salt)
    return `${toHex(salt.buffer)}:${toHex(derived)}`
}

const verifyPassword = async (data: {
    password: string
    hash: string
}) => {
    const [saltHex, hashHex] = data.hash.split(":")
    const derived = await derive(data.password, fromHex(saltHex))
    const expected = fromHex(hashHex)
    const actual = new Uint8Array(derived)
    if (actual.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i++)
        diff |= actual[i] ^ expected[i]
    return diff === 0
}
type TPassword = NonNullable<BetterAuthOptions["emailAndPassword"]>
export const password = {
    hash: hashPassword,
    verify: verifyPassword,
} satisfies TPassword["password"]
