# From an Artificial Neuron to an AI Chatbot

*Every step between a 1943 logic diagram and the chatbot on your phone, checked against the original papers, with code you can run.*

---

Here is an artificial neuron, complete:

```python
def neuron(x, w, b):
    return 1 if w[0] * x[0] + w[1] * x[1] + b > 0 else 0
```

Multiply each input by a weight, add them up, and fire if the total clears a threshold. That is all it does.

Now count a large language model in the same units. GPT-3, the direct ancestor of the model behind the first ChatGPT, has 96 layers. Each layer contains a block of 49,152 neurons doing what the function above does, with two changes: the hard threshold is replaced by a smooth curve, and each neuron reads 12,288 inputs instead of two.

```
feed-forward neurons per layer : 49,152
feed-forward neurons in total  : 4,718,592
weights per layer              : 1,811,939,328
weights in all 96 layers       : 173.9 billion
share in feed-forward neurons  : 67%
```

That output comes from `gpt3_neurons.py`, which works from the architecture table in the GPT-3 paper. The 173.9 billion lands within 1% of the published 175 billion; most of the gap is the table that turns each token into a vector. Two-thirds of the model's weights sit in plain neurons. Most of the rest belong to a mechanism called attention, which we'll get to.

So the distance from one neuron to a chatbot was not covered by inventing a better part. It was covered by changing the arrangement, the training rule, the data and the objective. That took about 80 years, including a stretch of more than a decade when few people believed it would work. Here is each step in order, and what each one added.

## 1943: A neuron that computes logic

A biological neuron collects signals from other cells. If the combined signal crosses a threshold, it fires an all-or-nothing pulse. In 1943, neurophysiologist Warren McCulloch and logician Walter Pitts published "A Logical Calculus of the Ideas Immanent in Nervous Activity," which reduced that to arithmetic: binary inputs, a threshold, a binary output. They showed that networks of these units could carry out logical operations, and therefore anything built from them.

You can check the idea in your head. Give a unit two inputs and a threshold of 2, and it fires only when both inputs are on: that is AND. Lower the threshold to 1 and it fires when either is on: OR. That is the sense in which a neuron "computes."

What the 1943 neuron could not do was learn. Every connection and threshold was set by hand, like wiring a circuit. The idea for learning came six years later from psychologist Donald Hebb, in *The Organization of Behavior* (1949):

> "When an axon of cell A is near enough to excite a cell B and repeatedly or persistently takes part in firing it, some growth process or metabolic change takes place in one or both cells such that A's efficiency, as one of the cells firing B, is increased."

Connections that get used get stronger. (The slogan "cells that fire together wire together" is not Hebb's. Neuroscientist Carla Shatz wrote it in *Scientific American* in 1992.)

## 1958: A neuron that learns

Frank Rosenblatt, a research psychologist at the Cornell Aeronautical Laboratory in Buffalo, turned learning into a precise rule. Show the neuron an example. If it answers correctly, do nothing. If it answers wrong, nudge every weight in the direction that would have made it right.

That rule is the core of `neuron.py`:

```python
error = target - neuron(x, w, b)   # -1, 0 or +1
if error:
    w[0] += lr * error * x[0]
    w[1] += lr * error * x[1]
    b += lr * error
```

Start with every weight at zero, feed it the four rows of the AND truth table, and it finds working weights by itself:

```
AND: learned in 6 epochs; weights=[2.0, 1.0], bias=-2.0, accuracy=100%
```

Nobody told it "2, 1, −2." It found those numbers by being wrong and correcting.

Rosenblatt first ran the perceptron as a program on an IBM 704, a five-ton computer that filled a room and read punch cards. At a U.S. Office of Naval Research event in July 1958, it taught itself in 50 trials to tell cards marked on the left from cards marked on the right. He then built the idea in hardware. The Mark I Perceptron had a 20×20 grid of photocells as its "retina," 512 hidden "association" units and 8 output units. Its adjustable weights were potentiometers, and electric motors turned the knobs as it learned. The machine is now in the Smithsonian's collections.

The press set a pattern that has held ever since. On July 8, 1958, *The New York Times* reported:

> "The Navy revealed the embryo of an electronic computer today that it expects will be able to walk, talk, see, write, reproduce itself and be conscious of its existence."

The machine could tell left from right.

## 1969: The wall

Give the same neuron XOR ("one or the other, but not both") and it never gets there:

```
XOR: never converged after 1000 epochs; weights=[-1.0, 0.0], bias=1.0, accuracy=50%
```

The reason is geometric. A single neuron draws one straight line through its inputs and fires on one side of it. Put XOR's four cases on a square:

```
x2 = 1 |  fire    .
x2 = 0 |   .     fire
       +--------------
         x1 = 0  x1 = 1
```

The two "fire" cases sit on opposite corners. No straight line separates them from the other two. The best any line can do is three out of four, so the learning rule keeps fixing one mistake by creating another, forever.

In 1969, Marvin Minsky and Seymour Papert published *Perceptrons*, a mathematical analysis of what single-layer perceptrons can and cannot compute. XOR is the textbook illustration; the book went much further, proving limits on global properties like parity and connectedness. Adding layers was the obvious way out, and the authors addressed it with a line that became famous:

> "We consider it to be an important research problem to elucidate (or reject) our intuitive judgment that the extension is sterile."

Their doubt had a real basis. Extra layers only help if you can train them, and Rosenblatt's rule works only where you can compare a neuron's output with the right answer. A hidden neuron in the middle of a network has no right answer to compare with. When the output is wrong, which of the hidden weights is to blame? In 1969 there was no practical way to say.

Funding and interest in neural networks fell away through the 1970s. Historians still argue over how much of that was the book and how much was the field's own overpromising. Rosenblatt did not see the recovery. He died in a sailing accident on Chesapeake Bay on July 11, 1971, his 43rd birthday.

## 1986: Passing the blame backward

The answer to "which weight is to blame?" turned out to be calculus. Replace the hard threshold with a smooth curve, and the network's error becomes a differentiable function of every weight. The chain rule then gives, for any weight anywhere in the network, how much the error would change if you nudged it. You compute that at the output first and pass it backward, layer by layer. That is backpropagation.

It was discovered more than once. Seppo Linnainmaa published the general method, now called reverse-mode automatic differentiation, in his 1970 master's thesis. Paul Werbos described using it to train neural networks in his 1974 dissertation. It finally caught on in 1986, when David Rumelhart, Geoffrey Hinton and Ronald Williams published "Learning representations by back-propagating errors" in *Nature*. They showed that a network's hidden units, trained this way, come to represent useful features of the task without being told what those features are.

Here is XOR again, with three hidden neurons and backpropagation (`xor_backprop.py`):

```
step     0: loss 0.2659
step  1000: loss 0.1669
step  2000: loss 0.0064
step  5000: loss 0.0008
step 20000: loss 0.0001

input (0, 0) -> output 0.007   (target 0)
input (0, 1) -> output 0.988   (target 1)
input (1, 0) -> output 0.989   (target 1)
input (1, 1) -> output 0.016   (target 0)
```

The problem used to show the limits of neural networks in 1969, solved in about 50 lines of plain Python. The hidden neurons re-map the inputs so that a single straight line at the output is enough.

Theory and applications followed. In 1989, George Cybenko proved that one hidden layer of sigmoid neurons can approximate any continuous function as closely as you like, given enough neurons. The same year, Yann LeCun and colleagues at AT&T Bell Labs used backpropagation to train a convolutional network that read handwritten ZIP codes from U.S. mail. John Hopfield (in 1982) and Hinton had also brought ideas from statistical physics into neural networks, work that earned them the 2024 Nobel Prize in Physics.

One more result from this era matters for chatbots. To read a sentence, a network processes it one word at a time and carries its state forward. When the error signal is passed back through many steps, it tends to shrink toward nothing or blow up. Sepp Hochreiter analyzed this "vanishing gradient" problem in his 1991 thesis, and with Jürgen Schmidhuber published a fix in 1997: the LSTM, a unit with a gated memory cell that lets the error signal survive across long gaps. Until the Transformer arrived twenty years later, LSTMs were the workhorse for neural networks that handled text.

## 2012: The missing ingredients were data and compute

By 1990 the core machinery existed: neurons, layers, backpropagation. Then neural networks spent much of the next two decades out of favor, outperformed on most benchmarks by other methods. The algorithm was not the bottleneck. There was not enough labeled data or cheap computing power to make large networks pay off.

ImageNet supplied the data: a competition built on about 1.2 million labeled training images in 1,000 categories. Graphics cards supplied the compute. In 2012, Alex Krizhevsky, Ilya Sutskever and Hinton entered AlexNet, a convolutional network with 60 million parameters trained on two NVIDIA gaming GPUs. It reached a top-5 error of 15.3%. The best entry not based on neural networks reached 26.2%. Every winner after that used a neural network.

A GPU multiplies large grids of numbers in parallel, and a layer of neurons is exactly that: a grid of weights multiplied by a list of inputs. Neural networks have been riding that hardware ever since.

## Predicting the next letter

A chatbot's core skill was described in 1951, when Claude Shannon published "Prediction and Entropy of Printed English." He measured how predictable English is by having people guess the next letter of a passage given everything before it. People turned out to be very good at it. Shannon estimated that English carries only about 0.6 to 1.3 bits of information per letter, against the roughly 4.75 bits needed if all 27 symbols (26 letters and a space) were equally likely.

Three years earlier, in the paper that founded information theory, Shannon had produced fake English by choosing each letter according to the letters before it. You can repeat that experiment. `next_char.py` goes through the text of the GNU General Public License, counts which character follows each short context, and then generates text by sampling the next character, appending it and repeating:

```
context = 1 character(s):
  The programer S cors SE m th ou. yon thiched (15, ore, tr gregheatonthecenthelur F b. ten at (f tecor rog anad pistharantsedo (rogr

context = 3 character(s):
  The program, if yource to that has "yource is and under appliabilition, or inducts further this infring Source copy othe gram inclu

context = 6 character(s):
  The program, in the work's users. We, the Free Software on general Public License will apply if the object code form of particular
```

Here is what the model actually produces at each step, a probability for every possible next character:

```
What comes after "the co"?
  'v': 40%
  'n': 33%
  'p': 13%
  'm': 10%
  'd': 3%
```

That loop is how every chatbot writes its answer: predict a probability distribution, pick one item from it, append it, repeat. ChatGPT does not compose a reply and then show it to you. It produces one token at a time, each conditioned on everything before it, including the tokens it has just written.

A table of counts falls apart quickly, though. With six characters of context it produces plausible fragments. With twenty words of context, nearly every context you meet is one the table has never seen, so there is nothing to count. Yoshua Bengio and colleagues described this as the curse of dimensionality in their 2003 paper "A Neural Probabilistic Language Model," and proposed the fix that language models still use. Represent each word as a learned vector of numbers, and let a neural network predict the next word from those vectors. Words used in similar ways end up with similar vectors, so a sentence the model has never seen can still resemble thousands it has.

In 2013, Tomas Mikolov's team at Google showed how much structure these vectors absorb. In their word2vec model, relationships became directions: the vector for *king*, minus *man*, plus *woman*, lands closest to *queen*.

Modern models work on tokens rather than whole words. Common words are single tokens and rare words are split into pieces, using a method adapted from a data-compression algorithm called byte-pair encoding (Sennrich and colleagues applied it to machine translation in 2016). In English, one token averages about four characters, roughly three-quarters of a word.

## 2017: Attention

Recurrent networks, LSTMs included, read text one token at a time and carry a running summary forward. In the 2014 sequence-to-sequence translation models, the whole input sentence had to be squeezed into a single fixed-length vector before the translation could begin. That same year, Dzmitry Bahdanau, Kyunghyun Cho and Yoshua Bengio identified the bottleneck and added attention. While producing each output word, the model looks back over all the input words and takes a weighted mix of them, with the weights computed on the spot from how relevant each input word is.

In June 2017, eight Google researchers published "Attention Is All You Need" and removed recurrence entirely. Their Transformer handles all tokens in parallel, and in every layer each token can draw information from the others. It scored 28.4 BLEU on English-to-German translation, a new state of the art, after 3.5 days of training on eight GPUs. With no step-by-step loop, it could use all the parallelism a GPU offers, which meant it could be scaled up.

Each Transformer layer has two parts:

1. **Attention.** Each token gathers information from the other tokens, which is how a model can connect "it" to the noun it refers to. In a chatbot, each token can look only at the tokens before it.
2. **Feed-forward.** A layer of ordinary neurons (weighted sums followed by a smooth nonlinearity) applied to each token's vector separately.

The second part is where the artificial neurons live. In GPT-3 it is the 49,152 neurons per layer from the top of this article, and it holds two-thirds of the weights. The neuron was never replaced. It became the bulk of the model.

## 2018–2020: Make it bigger

OpenAI then ran what amounted to one experiment at three sizes: take a Transformer, train it only to predict the next token on a huge amount of text, and see what comes out.

| Model | Released | Parameters | Training text |
|---|---|---|---|
| GPT-1 | June 2018 | 117 million | About 7,000 unpublished books |
| GPT-2 | February 2019 | 1.5 billion | 40 GB of text from 8 million web pages |
| GPT-3 | May 2020 | 175 billion | 300 billion tokens |

GPT-2's text was fluent enough that OpenAI at first withheld the full model, citing possible misuse, and released it in stages over nine months. GPT-3 was ten times larger than any previous non-sparse language model. Given a few examples in its prompt, it could handle tasks it was never specifically trained for, such as translation and question answering, with no further training.

The growth followed a rule. In January 2020, Jared Kaplan and colleagues at OpenAI reported that a language model's prediction error falls as a smooth power law as model size, data and compute increase, with trends spanning more than seven orders of magnitude. In 2022, DeepMind's Chinchilla paper adjusted the recipe. Chinchilla, with 70 billion parameters trained on 1.4 trillion tokens, beat the 280-billion-parameter Gopher on the same compute budget. The lesson: scale the data along with the model.

Why would guessing the next token produce anything that looks like understanding? Because guessing well is hard. To predict the next line of a physics derivation, a legal argument or a Python function, it helps to model what the text is about. The training objective never mentions grammar, facts or reasoning. The model picks up whatever of each helps it predict.

## 2022: From autocomplete to assistant

A model trained this way continues documents. It is not an assistant. OpenAI researcher Jan Leike described the problem to *Fortune* in January 2022. Ask GPT-3 to "explain the moon landing to a six-year-old," and it might carry on with "Please explain climate change to a six-year-old," because on the internet, a list of prompts is a likely continuation of a prompt.

OpenAI's InstructGPT paper (2022) laid out the fix in three steps:

1. **Supervised fine-tuning.** Human contractors write good answers to sample prompts, and the model is trained on them.
2. **A reward model.** The model writes several answers to the same prompt, people rank them, and a second network is trained to predict those rankings.
3. **Reinforcement learning.** The model is tuned to produce answers the reward model scores highly.

Steps 2 and 3 are called reinforcement learning from human feedback, or RLHF. Paul Christiano and colleagues had demonstrated the approach in 2017 by teaching a simulated robot to do a backflip from about 900 human comparisons of short video clips. Nobody had to write a definition of "backflip."

The result was lopsided. Human evaluators preferred answers from a 1.3-billion-parameter InstructGPT model over those from the 175-billion-parameter GPT-3, a model more than 100 times its size. Pre-training gave the model its knowledge. The feedback step made that knowledge usable.

On November 30, 2022, OpenAI released ChatGPT, describing it as a "sibling model to InstructGPT," fine-tuned with RLHF from a model in the GPT-3.5 series. Sam Altman said it passed one million users five days later. By January 2023, UBS analysts working from web-traffic data estimated 100 million monthly users. In February 2026, OpenAI reported 900 million weekly users.

## What happens when you press Enter

Put the pieces together and follow one message through a chatbot:

1. **The conversation becomes one document.** Your message, the earlier turns and the provider's instructions are joined into a single text, with special markers showing who said what.
2. **The text becomes tokens**, each one an integer ID.
3. **Each token becomes a vector**, looked up in a table learned during training.
4. **The vectors pass through the layers.** In each layer, attention lets every token gather context from the tokens before it, and the feed-forward neurons transform each token's vector. GPT-3 repeats this 96 times.
5. **The final vector becomes a probability for every token in the vocabulary.** It is the same kind of output as `next_char.py`, spread over tens of thousands of tokens instead of a few dozen characters.
6. **One token is sampled.** It is not always the most likely one; a setting called temperature controls how adventurous the choice is.
7. **The token is appended, and the loop runs again**, until the model produces a token that means "end of turn."

Newer chatbots build on this loop without replacing it. "Reasoning" models, beginning with OpenAI's o1 in September 2024, are trained with reinforcement learning to write out a long chain of intermediate steps before giving the final answer. Tool use works the same way: the model emits tokens that request a web search or a calculation, the result is inserted into the document, and prediction continues.

## The ELIZA problem

In 1966, MIT computer scientist Joseph Weizenbaum published ELIZA, a program that imitated a psychotherapist by matching keywords and turning the user's sentences back into questions. It had no neurons, no learning and no model of the world. In his 1976 book *Computer Power and Human Reason*, Weizenbaum recalled that his secretary, who had watched him work on the program for months, asked him to leave the room after only a few exchanges with it. He wrote:

> "What I had not realized is that extremely short exposures to a relatively simple computer program could induce powerful delusional thinking in quite normal people."

That warning cuts both ways today. A modern chatbot is not ELIZA. It is a trained predictor with billions of learned weights, and it does things no keyword matcher could. But fluency is exactly what it was optimized for, so fluency alone tells you little about whether a particular answer is true.

The accurate picture is less mysterious than the marketing and more surprising than "just autocomplete." Every part of a chatbot can be written down: the 1943 neuron with a smoother threshold, Rosenblatt's idea of learning from error, the 1986 method of passing blame backward, Shannon's next-letter game, the 2017 attention layer and a final round of human feedback. None of these parts is intelligent on its own. What nobody predicted in 1958, or in 1986, or in 2018, was how much capability would come from stacking millions of them and training them on a large share of everything people have written.

The 1958 *Times* story promised a machine that would "walk, talk, see, write." The talking took 64 years. The neuron inside barely changed.

---

## Run the code

All four scripts are plain Python 3 with no dependencies, in [`code/`](code/):

| Script | What it shows |
|---|---|
| `neuron.py` | Rosenblatt's learning rule: learns AND, fails on XOR |
| `xor_backprop.py` | A two-layer network learning XOR with backpropagation |
| `next_char.py` | Shannon-style next-character prediction and the generation loop |
| `gpt3_neurons.py` | Where GPT-3's 175 billion parameters live |

`next_char.py` reads `/usr/share/common-licenses/GPL-3`, which ships with Debian and Ubuntu; pass any other text file as an argument.

## Sources

**The neuron and the perceptron**
- McCulloch & Pitts (1943), "A Logical Calculus of the Ideas Immanent in Nervous Activity," *Bulletin of Mathematical Biophysics*. [Springer 70th-anniversary chapter](https://link.springer.com/chapter/10.1007/978-3-319-10783-7_1)
- Hebb (1949), *The Organization of Behavior*; origin of "fire together, wire together": [Language Log](https://languagelog.ldc.upenn.edu/nll/?p=25194), [SfN interview with Carla Shatz](https://neuronline.sfn.org/scientific-research/fire-together-wire-together-carla-shatz-on-scientific-breakthroughs)
- Cornell Chronicle (2019), ["Professor's perceptron paved the way for AI – 60 years too soon"](https://news.cornell.edu/stories/2019/09/professors-perceptron-paved-way-ai-60-years-too-soon) (IBM 704 demonstration, Mark I in the Smithsonian, Rosenblatt's career)
- Mark I Perceptron hardware: [Wikipedia](https://en.wikipedia.org/wiki/Mark_I_Perceptron); Rosenblatt's death: [UMass Computational Phonology, "Remembering Frank Rosenblatt"](https://websites.umass.edu/comphon/2021/07/08/remembering-frank-rosenblatt/)
- *The New York Times*, July 8, 1958, "New Navy Device Learns by Doing," quoted in [Wikipedia: Perceptron](https://en.wikipedia.org/wiki/Perceptron)
- Minsky & Papert (1969), *Perceptrons*; the "sterile" quote: [Quote Investigator](https://quoteinvestigator.com/2026/07/24/perceptron-sterile/)

**Backpropagation and the 1980s–90s**
- Rumelhart, Hinton & Williams (1986), ["Learning representations by back-propagating errors,"](https://www.nature.com/articles/323533a0) *Nature* 323, 533–536
- Schmidhuber, ["Who Invented Backpropagation?"](https://people.idsia.ch/~juergen/who-invented-backpropagation.html) (Linnainmaa 1970, Werbos 1974)
- Hopfield (1982), ["Neural networks and physical systems with emergent collective computational abilities,"](https://www.pnas.org/doi/10.1073/pnas.79.8.2554) *PNAS*
- LeCun et al. (1989), ["Backpropagation Applied to Handwritten Zip Code Recognition,"](https://direct.mit.edu/neco/article/1/4/541/5515/Backpropagation-Applied-to-Handwritten-Zip-Code) *Neural Computation*
- Cybenko (1989), universal approximation: [Wikipedia](https://en.wikipedia.org/wiki/Universal_approximation_theorem)
- Hochreiter & Schmidhuber (1997), Long Short-Term Memory, *Neural Computation*
- [The Nobel Prize in Physics 2024](https://www.nobelprize.org/prizes/physics/2024/summary/)

**Deep learning and language models**
- Krizhevsky, Sutskever & Hinton (2012), AlexNet: [PyTorch Hub summary](https://pytorch.org/hub/pytorch_vision_alexnet/)
- Shannon (1948), ["A Mathematical Theory of Communication"](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf); Shannon (1951), ["Prediction and Entropy of Printed English"](https://www.princeton.edu/~wbialek/rome/refs/shannon_51.pdf)
- Bengio et al. (2003), ["A Neural Probabilistic Language Model,"](https://jmlr.org/papers/v3/bengio03a.html) *JMLR*
- Mikolov et al. (2013), word2vec: [The Morning Paper, "The amazing power of word vectors"](https://blog.acolyer.org/2016/04/21/the-amazing-power-of-word-vectors/)
- Sennrich, Haddow & Birch (2016), ["Neural Machine Translation of Rare Words with Subword Units"](https://arxiv.org/pdf/1508.07909); OpenAI, ["What are tokens and how to count them"](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them)
- Bahdanau, Cho & Bengio (2014), "Neural Machine Translation by Jointly Learning to Align and Translate"
- Vaswani et al. (2017), ["Attention Is All You Need"](https://papers.neurips.cc/paper/7181-attention-is-all-you-need.pdf)

**The GPT era and chatbots**
- Radford et al. (2018), GPT-1; GPT-2 [model card](https://github.com/openai/gpt-2/blob/master/model_card.md) and ["Release Strategies and the Social Impacts of Language Models"](https://arxiv.org/pdf/1908.09203)
- Brown et al. (2020), ["Language Models are Few-Shot Learners"](https://arxiv.org/pdf/2005.14165) (GPT-3; architecture from Table 2.1, training tokens from Table 2.2)
- Kaplan et al. (2020), "Scaling Laws for Neural Language Models"; Hoffmann et al. (2022), ["Training Compute-Optimal Large Language Models"](https://arxiv.org/pdf/2203.15556)
- Christiano et al. (2017), ["Deep Reinforcement Learning from Human Preferences"](https://arxiv.org/pdf/1706.03741)
- Ouyang et al. (2022), ["Training language models to follow instructions with human feedback"](https://arxiv.org/pdf/2203.02155); *Fortune*, ["OpenAI says it is making progress on A.I.'s 'Alignment Problem'"](https://fortune.com/2022/01/27/openai-alignment-problem-instructgpt-gpt-3/) (Jan Leike's moon-landing example)
- OpenAI (2022), ["Introducing ChatGPT"](https://openai.com/index/chatgpt/); launch and user figures: [Wikipedia: ChatGPT](https://en.wikipedia.org/wiki/ChatGPT); TechCrunch, ["ChatGPT reaches 900M weekly active users"](https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users) (February 27, 2026)
- OpenAI o1: [System Card, September 12, 2024](https://cdn.openai.com/o1-system-card.pdf)

**ELIZA**
- Weizenbaum (1966), "ELIZA—a computer program for the study of natural language communication between man and machine," *Communications of the ACM*; Weizenbaum (1976), *Computer Power and Human Reason*. [Smithsonian Magazine](https://www.smithsonianmag.com/history/why-the-computer-scientist-behind-the-worlds-first-chatbot-dedicated-his-life-to-publicizing-the-threat-posed-by-ai-180987971/)
