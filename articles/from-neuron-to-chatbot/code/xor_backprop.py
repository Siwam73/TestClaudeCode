"""A two-layer network that learns XOR with backpropagation (Rumelhart, Hinton & Williams, 1986).

Runs with plain Python 3, no dependencies:  python3 xor_backprop.py
"""
import math
import random

random.seed(0)
sigmoid = lambda z: 1 / (1 + math.exp(-z))

XOR = [((0, 0), 0), ((0, 1), 1), ((1, 0), 1), ((1, 1), 0)]
H = 3  # hidden neurons

# Hidden layer: H neurons, each with 2 weights + bias. Output: 1 neuron with H weights + bias.
w1 = [[random.uniform(-1, 1) for _ in range(2)] for _ in range(H)]
b1 = [random.uniform(-1, 1) for _ in range(H)]
w2 = [random.uniform(-1, 1) for _ in range(H)]
b2 = random.uniform(-1, 1)
lr = 0.5


def forward(x):
    h = [sigmoid(w1[j][0] * x[0] + w1[j][1] * x[1] + b1[j]) for j in range(H)]
    y = sigmoid(sum(w2[j] * h[j] for j in range(H)) + b2)
    return h, y


for step in range(20001):
    loss = 0.0
    for x, t in XOR:
        h, y = forward(x)
        loss += (y - t) ** 2
        # Backward pass: push the error from the output back through each layer.
        dy = (y - t) * y * (1 - y)
        dh = [dy * w2[j] * h[j] * (1 - h[j]) for j in range(H)]
        for j in range(H):
            w2[j] -= lr * dy * h[j]
            w1[j][0] -= lr * dh[j] * x[0]
            w1[j][1] -= lr * dh[j] * x[1]
            b1[j] -= lr * dh[j]
        b2 -= lr * dy
    if step in (0, 1000, 2000, 5000, 20000):
        print(f"step {step:>5}: loss {loss / 4:.4f}")

print()
for x, t in XOR:
    print(f"input {x} -> output {forward(x)[1]:.3f}   (target {t})")
