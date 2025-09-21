from simhash import Simhash

def simhash_text(text: str) -> str:
    return hex(Simhash(text).value)

def is_dup(hash_a: str, hash_b: str, hamming_thresh: int = 4) -> bool:
    a, b = int(hash_a, 16), int(hash_b, 16)
    return bin(a ^ b).count("1") <= hamming_thresh