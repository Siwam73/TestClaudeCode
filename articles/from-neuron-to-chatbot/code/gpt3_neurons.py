"""Back-of-envelope: where GPT-3's 175 billion parameters live.

Architecture numbers are from Brown et al. (2020), Table 2.1:
96 layers, d_model = 12,288, and a feed-forward layer 4x wider than d_model.
"""
layers, d_model = 96, 12_288
d_ff = 4 * d_model

attention = 4 * d_model * d_model          # query, key, value and output projections
feed_forward = 2 * d_model * d_ff          # up-projection into d_ff neurons, and back down
per_layer = attention + feed_forward

print(f"feed-forward neurons per layer : {d_ff:,}")
print(f"feed-forward neurons in total  : {layers * d_ff:,}")
print(f"weights per layer              : {per_layer:,}")
print(f"weights in all {layers} layers       : {layers * per_layer / 1e9:.1f} billion")
print(f"share in feed-forward neurons  : {feed_forward / per_layer:.0%}")
