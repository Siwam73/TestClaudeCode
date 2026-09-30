"""The chatbot loop in miniature: predict the next character, append it, repeat.

The "model" here is just a lookup table of counts (a Shannon-style n-gram),
not a neural network. The loop around it is the same one a chatbot runs.
Trained on the text of the GNU GPL v3, because it ships with most Linux systems.

Runs with plain Python 3, no dependencies:  python3 next_char.py [path/to/text]
"""
import random
import sys
from collections import Counter, defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/common-licenses/GPL-3"
text = " ".join(open(path, encoding="utf-8").read().split())  # collapse whitespace


def train(text, context):
    table = defaultdict(Counter)
    for i in range(len(text) - context):
        table[text[i:i + context]][text[i + context]] += 1
    return table


def generate(table, context, prompt, length, rng):
    out = prompt
    for _ in range(length):
        counts = table.get(out[-context:])
        if not counts:
            break
        chars, weights = zip(*counts.items())
        out += rng.choices(chars, weights=weights)[0]  # sample the next character
    return out


print(f"training text: {len(text):,} characters\n")
for context in (1, 3, 6):
    table = train(text, context)
    sample = generate(table, context, "The program", 120, random.Random(7))
    print(f"context = {context} character(s):\n  {sample}\n")

table = train(text, 6)
dist = table["the co"]
total = sum(dist.values())
print('What comes after "the co"?')
for ch, n in dist.most_common(5):
    print(f"  {ch!r}: {n / total:.0%}")
