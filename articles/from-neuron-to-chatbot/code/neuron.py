"""One artificial neuron, trained with Rosenblatt's 1958 perceptron rule.

Runs with plain Python 3, no dependencies:  python3 neuron.py
"""

def neuron(x, w, b):
    # Weighted sum of inputs, then a hard threshold: fire (1) or stay silent (0).
    return 1 if w[0] * x[0] + w[1] * x[1] + b > 0 else 0


def train(truth_table, epochs=25, lr=1.0):
    w, b = [0.0, 0.0], 0.0
    for epoch in range(1, epochs + 1):
        mistakes = 0
        for x, target in truth_table:
            error = target - neuron(x, w, b)   # -1, 0 or +1
            if error:
                mistakes += 1
                w[0] += lr * error * x[0]      # nudge each weight toward the answer
                w[1] += lr * error * x[1]
                b += lr * error
        if mistakes == 0:
            return w, b, epoch
    return w, b, None


def accuracy(truth_table, w, b):
    return sum(neuron(x, w, b) == t for x, t in truth_table) / len(truth_table)


AND = [((0, 0), 0), ((0, 1), 0), ((1, 0), 0), ((1, 1), 1)]
XOR = [((0, 0), 0), ((0, 1), 1), ((1, 0), 1), ((1, 1), 0)]

for name, table in [("AND", AND), ("XOR", XOR)]:
    w, b, epoch = train(table, epochs=1000)
    status = f"learned in {epoch} epochs" if epoch else "never converged after 1000 epochs"
    print(f"{name}: {status}; weights={w}, bias={b}, accuracy={accuracy(table, w, b):.0%}")
