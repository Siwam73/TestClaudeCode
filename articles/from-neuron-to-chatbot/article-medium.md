# The Navy Predicted a Talking Machine in 1958. It Took 64 Years.

*A plain-English trip from the first artificial neuron to ChatGPT, with light switches, a kitchen, and real code output along the way.*

---

In the summer of 1958, *The New York Times* reported that the U.S. Navy had built "the embryo of an electronic computer" that it expected would one day "walk, talk, see, write, reproduce itself and be conscious of its existence."

The machine could tell left from right.

That was the demo. A room-sized computer, fed punch cards, learned to sort cards marked on the left from cards marked on the right. It took 50 tries.

Sixty-four years later, ChatGPT showed up and the talking part finally got good. The surprising part is how little the basic building block changed in between. The unit inside ChatGPT is the same idea that 1958 machine ran on, and you can write it in one line of code.

## The whole idea fits in one line

```python
def neuron(x, w, b):
    return 1 if w[0] * x[0] + w[1] * x[1] + b > 0 else 0
```

If you don't read Python, no problem. The neuron takes a few inputs, multiplies each by a weight that says how much it matters, adds it all up, and says yes (1) if the total clears a bar. Otherwise, no (0).

You do this constantly. Say you're deciding whether to go to a friend's party. Your best friend is going, which counts for a lot. It's raining, which counts against. You have to be up at 6, which counts against a lot. Somewhere in your head the pluses and minuses get added up, and if the total tips past your personal threshold, you grab your coat.

That's a neuron. The weights are how much you care about each thing. The threshold is how much convincing you need.

Now the jump. GPT-3, the direct ancestor of the first ChatGPT, has 96 layers. Each layer holds 49,152 of these units, with two upgrades: instead of a hard yes or no, each gives a smooth score, and instead of two inputs, each reads 12,288. That's about 4.7 million neurons, and they hold roughly two-thirds of the model's 175 billion adjustable numbers. (The arithmetic, using the architecture table from the GPT-3 paper, lands within 1% of the published total. The script is linked at the end.)

**So the part barely changed.** What changed was everything around it. Figuring out how to wire millions of them together, and how to train them, took about 80 years, including a long stretch when almost nobody thought it would work.

## 1943: A brain cell, boiled down to arithmetic

A neuron in your brain collects tiny electrical signals from thousands of neighbors. If enough arrive at once, it fires a pulse of its own. It doesn't fire halfway. All or nothing.

Warren McCulloch, a neurophysiologist, and Walter Pitts, a young logician, wrote that down as math in 1943: inputs that are on or off, a threshold, an output that's on or off. Then they showed that networks of these units could do logic. Set a unit to fire only when both inputs are on, and you've built AND. Let either input trigger it, and you've built OR. Wire enough of those together and you can compute anything you can express in logic.

One big thing was missing, though. The 1943 neuron couldn't learn. Every connection had to be set by hand, like wiring a fuse box.

In 1949, psychologist Donald Hebb offered a theory of how brains might learn. His version, roughly: when one brain cell keeps helping another fire, the connection between them gets stronger. Use it and it grows.

(You may know this as "cells that fire together wire together." Hebb never wrote that. The catchy version is usually credited to neuroscientist Carla Shatz, who put it in print in 1992.)

## 1958: A machine that learns from its mistakes

Frank Rosenblatt, a research psychologist at the Cornell Aeronautical Laboratory in Buffalo, New York, turned learning into a rule that fits on an index card:

1. Show the neuron an example.
2. If it gets the answer right, do nothing.
3. If it gets it wrong, nudge each weight a little toward what would have made it right.

It's how you fix a shower. Too cold, turn the knob a bit toward hot. Too hot, ease it back. You don't need to understand the plumbing. You just react to the error until it feels right.

Give that rule the four cases of AND, start every weight at zero, and it works out the answer by itself. A short Python version prints this:

```
AND: learned in 6 epochs; weights=[2.0, 1.0], bias=-2.0, accuracy=100%
```

An epoch is one pass through all four examples. Nobody told it to use 2, 1 and −2. It found those numbers within six passes, just by being wrong and adjusting.

Rosenblatt's first perceptron was a program running on an IBM 704, a five-ton computer that filled a room. That was the July 1958 demo. Next, he built one as dedicated hardware. The Mark I Perceptron, first shown to the press in June 1960, had a 20-by-20 grid of light sensors for an eye, 512 hidden units and eight outputs. Its weights were physical knobs, and when it learned, electric motors turned them. The machine survives in the Smithsonian's collection.

So when the *Times* wrote about a computer that would walk and talk, the actual machine was an IBM mainframe learning to tell left from right. The motorized knobs came two years later. AI hype, it turns out, is older than the microchip.

## 1969: The light switch that stumped AI

Now a slightly different puzzle.

You've probably got a hallway or stairway light with a switch at each end. Start with the light off and both switches down. Flip either one and the light comes on. Flip the other one too, and it goes off again. The light is on when exactly one switch is up. Logicians call that XOR: one or the other, but not both.

A single neuron can't learn it. Not "struggles to." Can't.

```
XOR: never converged after 1000 epochs; weights=[-1.0, 0.0], bias=1.0, accuracy=50%
```

The reason is geometry. A single neuron decides by drawing one straight line through the space of possible inputs: yes on one side, no on the other. Lay the four switch combinations out on a square:

```
switch B up   |   ON      off
switch B down |   off     ON
              +-----------------
                A down   A up
```

The two ON cases sit in opposite corners. Try to fence them off from the two "off" cases with a single straight line. You can't. The best one line can manage is three out of four, so the learning rule chases its tail forever, fixing one mistake by creating another.

Marvin Minsky and Seymour Papert of MIT made this rigorous in their 1969 book *Perceptrons*, which mapped out what single-layer networks could and couldn't do. XOR is the simplest case of one problem they analyzed, called parity. They also proved limits on harder things, like telling whether a shape is all in one piece.

The obvious escape hatch was more layers. Minsky and Papert addressed it in a sentence that aged badly:

> "We consider it to be an important research problem to elucidate (or reject) our intuitive judgment that the extension is sterile."

In fairness, they had a point at the time. Extra layers only help if you can train them, and Rosenblatt's rule only works when you can compare a neuron's output with the right answer. A neuron buried in the middle of a network has no right answer to compare against. When the final output is wrong, which of the hidden knobs do you turn?

Nobody knew. Money and interest drained out of the field through the 1970s, and historians still argue over how much of that was the book and how much was the field's own overpromising. Rosenblatt didn't see the comeback. He died in a boating accident on Chesapeake Bay in 1971, on his 43rd birthday.

## 1986: How to blame the right neuron

Picture a restaurant kitchen. A customer sends back the soup: too salty. The head chef doesn't fire the whole staff. She works backward. The soup came from the sauce station, which used stock from the stock station, which got its salt from the prep cook. Each station takes a share of the blame in proportion to how much salt it added, and each one adjusts a little.

That's backpropagation, the idea that finally broke through the wall.

It starts with a small change. Swap the neuron's hard yes/no for a smooth dial, so a tiny change to any weight makes a tiny change in the output. Once everything is smooth, calculus (the chain rule, specifically) can tell you for every weight in the network how much the final error would change if you nudged it. You work it out at the output first, then pass the blame backward layer by layer, the way the chef traced the salt back through the kitchen.

The math was found more than once. A Finnish master's student, Seppo Linnainmaa, published the general method in 1970. Paul Werbos described using it on neural networks in his 1974 PhD thesis. It didn't catch on until 1986, when David Rumelhart, Geoffrey Hinton and Ronald Williams published it in *Nature* with a striking result: hidden neurons trained this way invent their own useful features. Nobody tells them what to look for.

Here's XOR again, now with three hidden neurons and backprop. The outputs are scores from 0 to 1, where close to 0 means off and close to 1 means on:

```
input (0, 0) -> output 0.007   (target 0)
input (0, 1) -> output 0.988   (target 1)
input (1, 0) -> output 0.989   (target 1)
input (1, 1) -> output 0.016   (target 0)
```

The problem at the center of the 1969 case against neural networks, solved in about 50 lines of plain Python. The hidden layer reshapes the problem until one straight line is enough.

After that, things moved. By 1989, Yann LeCun's team at AT&T Bell Labs had used backprop to train a network on handwritten ZIP codes taken from real U.S. mail. The physics-inspired networks John Hopfield and Hinton built in the '80s later won them the 2024 Nobel Prize in Physics. And in 1997, Sepp Hochreiter and Jürgen Schmidhuber built the LSTM, a unit with a memory cell that helps a network keep track of long sequences like sentences. Through most of the 2010s, it was the go-to design for language.

## 2012: It was never the algorithm

By 1990, the core machinery existed: neurons, layers, backprop. And for roughly the next two decades, neural networks mostly sat on the bench while other methods won the benchmarks.

The idea was fine. It was starving. There wasn't enough labeled data to learn from, and computers were too slow to train big networks in any reasonable amount of time.

Two things fixed that. The first was ImageNet, a competition built on about 1.2 million labeled photos sorted into 1,000 categories. The second was gaming hardware.

A graphics card (GPU) is built to do millions of small, identical calculations at the same time, because that's what drawing a video game frame takes. By luck, it's also exactly what a layer of neurons takes: a big grid of weights multiplied against a list of inputs. A regular processor is like a few brilliant math professors. A GPU is like a stadium full of people who can each only add, all adding at once. For neural networks, you want the stadium.

Then came 2012. Alex Krizhevsky, Ilya Sutskever and Hinton entered ImageNet with AlexNet, a network with 60 million weights trained on two gaming GPUs. Its top-5 error (how often the right label wasn't among its five best guesses) was 15.3%. The best entry that didn't use neural networks scored 26.2%. Every winner after that year used a neural network.

## Your phone keyboard is doing the same thing

Every chatbot is built on one skill, and you've been using a tiny version of it for years: the row of suggested words above your phone's keyboard.

The idea goes back to 1951, when Claude Shannon, the Bell Labs mathematician who founded information theory, ran an experiment. He showed people a stretch of English text and asked them to guess the next letter, then the next. People turned out to be scarily good at it. From their guesses, Shannon estimated that English carries only about 0.6 to 1.3 bits of information per letter, when a random string of 26 letters plus a space would need about 4.75. Most of what we write is predictable.

### Try it: a 40-line text generator

You can build a crude next-letter predictor in about 40 lines of Python. This one reads the GNU General Public License (a long legal document that comes with many Linux systems), counts which character tends to follow each short run of characters, and then writes new text one character at a time: guess, append, repeat. The output depends on how many previous characters it gets to look at:

```
context = 1 character(s):
  The programer S cors SE m th ou. yon thiched (15, ore, tr gregheatonthecenthelur F b.

context = 3 character(s):
  The program, if yource to that has "yource is and under appliabilition, or inducts further

context = 6 character(s):
  The program, in the work's users. We, the Free Software on general Public License will apply if the object code form of particular
```

With one character of memory, it's alphabet soup. With six, it sounds like a lawyer talking in their sleep.

The important part is what happens at each step. The model produces odds for every possible next character:

```
What comes after "the co"?
  'v': 40%
  'n': 33%
  'p': 13%
  'm': 10%
  'd': 3%
```

Then it rolls weighted dice. **That's exactly how ChatGPT writes to you**, one small chunk at a time: predict the odds, pick one, add it to the conversation, go again. Every pick takes everything so far into account, including the words it just wrote.

### Why counting runs out

A table of counts runs out fast, though. With a few characters of context, it has seen plenty of examples of each one. With twenty words of context, almost every stretch you meet is brand new, so there's nothing to count. In 2003, Yoshua Bengio and his colleagues proposed the fix that language models still use: turn each word into a list of numbers and let a neural network learn to predict from those.

Think of it as a map where every word has a location, and words that get used in similar ways end up in the same neighborhood. A sentence the model has never seen can still sit close to thousands it has. In 2013, a Google team led by Tomas Mikolov showed how much structure these maps absorb. Take the location of "king," subtract "man," add "woman," and the closest word, once you set aside the three you started with, is "queen." The model had picked up something like a direction for gender, and nobody told it to.

One practical note: modern models don't read whole words. They read tokens, which are common words or pieces of rarer ones. In English, a token averages about four characters, roughly three-quarters of a word.

## 2017: Letting every word look at every other word

Read this sentence: "The animal didn't cross the street because it was too tired."

What does "it" mean? You knew instantly. Streets don't get tired. But to get there, you connected "it" to a word six places back and used what you know about animals and streets.

Older networks read like someone peering through a keyhole, one word at a time, carrying a running summary. By the end of a long sentence, the start had gone fuzzy. In 2014, Dzmitry Bahdanau, Kyunghyun Cho and Yoshua Bengio gave translation models a way around that, called attention: while writing each word of the translation, the model could look back over the whole original sentence and decide which words mattered right then.

In June 2017, eight Google researchers pushed that idea as far as it would go, in a paper with a cocky title: "Attention Is All You Need." They threw out word-by-word reading entirely. In their design, the Transformer, every word looks at every other word at once, and each one works out for itself which others are relevant. It set a new record on English-to-German translation after 3.5 days of training on eight GPUs. And since it didn't have to go word by word during training, it could put far more of a GPU's parallel muscle to work. It could scale.

### Inside one Transformer layer

Every layer of a Transformer does two jobs:

- Attention, where each token gathers information from the other tokens. This is where "it" gets linked to "animal." In a chatbot, each token can only look back at earlier ones, never ahead.
- A feed-forward block, which is simply a big layer of ordinary neurons (the same weighted-sum units from 1958, with a smooth dial instead of a hard threshold) applied to each token separately.

That second job is where the 49,152 neurons per layer from the start of this story live.

**The neuron never got replaced. It just got a lot of company.**

## Then they just made it bigger

Starting in 2018, OpenAI ran what amounted to one experiment at three sizes. Take a Transformer, train it on a mountain of text to do nothing but predict the next token, and see what comes out.

- GPT-1 (June 2018): 117 million weights, trained on about 7,000 unpublished books.
- GPT-2 (February 2019): 1.5 billion weights, trained on 40 GB of text from 8 million web pages.
- GPT-3 (May 2020): 175 billion weights, trained on 300 billion tokens.

GPT-2 wrote convincingly enough that OpenAI held back the full model at first, citing misuse worries, and released it in stages over nine months. GPT-3 was ten times bigger than any language model before it (not counting so-called sparse designs). Show it a couple of examples in the prompt and it could translate or answer questions it was never specifically trained for, with no retraining at all.

The growth wasn't luck. In January 2020, Jared Kaplan and colleagues at OpenAI showed that a language model's error falls along a smooth, predictable curve as you add parameters, data and computing power, with some trends holding across more than seven orders of magnitude.

Which leaves the obvious question. Why would guessing the next word produce anything that looks like understanding?

The best answer I know: because guessing well is hard. Try predicting the next line of a physics proof or a Python function. Doing that reliably takes some grasp of what the text is about. Nobody ever teaches the network grammar, let alone physics. It picks up whatever helps it guess better.

## The genius who answers questions with more questions

There's a catch. A model trained this way just keeps writing whatever document you started.

OpenAI researcher Jan Leike gave *Fortune* a perfect example in 2022. Ask GPT-3 to "explain the moon landing to a six-year-old," and it might come back with "Please explain climate change to a six-year-old." From the model's point of view, that's a great continuation. On the internet, a list of prompts is often followed by more prompts.

It's like a brilliant new hire who has read the entire internet but has never held a job. The knowledge is all in there. Nobody has shown them what a helpful answer looks like.

### Three rounds of onboarding

OpenAI's fix, laid out in its 2022 InstructGPT paper, worked like three rounds of onboarding:

1. Show it good work. Human contractors wrote strong answers to sample prompts, and the model trained on them.
2. Run taste tests. The model wrote several answers to the same prompt, people ranked them, and a second network learned to predict those rankings.
3. Practice against the taste tester. Through trial and error, the model was tuned to write answers that second network would score highly.

Steps 2 and 3 are called reinforcement learning from human feedback, or RLHF. One early, memorable demo came in 2017, when Paul Christiano and colleagues taught a simulated robot to do a backflip using about 900 human judgments of which of two short clips looked more like one. Nobody ever had to define "backflip" in code.

The results were lopsided. People preferred answers from a 1.3-billion-weight InstructGPT over those from the 175-billion-weight GPT-3, a model more than 100 times its size. Knowing a lot and being helpful turned out to be different skills, and the second one could be taught.

On November 30, 2022, OpenAI released ChatGPT, which it described as a "sibling model to InstructGPT," fine-tuned with RLHF from a model in its GPT-3.5 series. Five days later, Sam Altman said it had passed a million users. By January 2023, analysts at UBS, working from web traffic data, estimated 100 million monthly users. In February 2026, OpenAI reported 900 million weekly users.

## What actually happens when you hit Enter

Put the pieces together and this is the trip your message takes:

1. Your message, the earlier back-and-forth and the company's behind-the-scenes instructions get stitched into one long document, with special markers noting who said what.
2. The document gets chopped into tokens, and each token becomes an ID number.
3. Each ID is swapped for its list of numbers, its spot on the word map, learned during training.
4. Those lists flow up through the layers. In each one, attention lets every token pull in context from the tokens before it, and the neurons transform what each token carries. GPT-3 does this 96 times.
5. At the top, the model puts out odds for every token in its vocabulary. Same idea as the "the co" example, just spread over far more options (GPT-3 has 50,257 tokens to choose from) instead of a few letters.
6. One token gets picked, and not always the most likely one. A setting called temperature controls how adventurous the pick is. Turn it down and the model plays it safe. Turn it up and it takes chances.
7. That token is added to the document, and the whole thing runs again. And again. Until the model produces a special token that means "I'm done."

Newer chatbots build on this loop without replacing it. "Reasoning" models, starting with OpenAI's o1 in September 2024, are trained to write out a long chain of intermediate steps before they give a final answer. Tool use works the same way: the model writes a request for a web search or a calculator, the result gets pasted into the document, and prediction picks up where it left off.

## The warning from 1966

ELIZA came out of MIT in 1966. Joseph Weizenbaum wrote it, and its most famous script, DOCTOR, played a therapist by spotting keywords and turning your own sentences back into questions. Tell it you're unhappy and it asks about your being unhappy. That was about the extent of it. It had no neurons and learned nothing.

In his 1976 book *Computer Power and Human Reason*, Weizenbaum recalled that his secretary, who had watched him work on the program for months, asked him to leave the room after only a few exchanges with it. He wrote:

> "What I had not realized is that extremely short exposures to a relatively simple computer program could induce powerful delusional thinking in quite normal people."

That line has aged strangely well, and it cuts two ways now. ChatGPT is a far more capable machine, a trained predictor with billions of learned weights that does things no keyword trick ever could. But sounding fluent is a big part of what it was trained for. So fluency on its own tells you almost nothing about whether a particular answer is true.

So is ChatGPT "just autocomplete"? In the narrowest sense, sure. It predicts the next token. But that's a bit like calling a cathedral "just bricks." Accurate, and it skips the part where nobody expected bricks to add up to that.

In 1958, the Navy said its machine would one day talk. It took 64 years, billions of knobs and a big slice of the internet to build one worth talking to. The neuron inside barely changed.

---

*If you want to watch a single neuron fail at the hallway-light problem yourself, all four scripts from this story are [on GitHub](https://github.com/Siwam73/TestClaudeCode/tree/claude/new-session-ua8kpc/articles/from-neuron-to-chatbot/code), and they run on plain Python with nothing to install.*

## Sources

- McCulloch & Pitts, "A Logical Calculus of the Ideas Immanent in Nervous Activity" (1943). [Springer retrospective](https://link.springer.com/chapter/10.1007/978-3-319-10783-7_1)
- Hebb, *The Organization of Behavior* (1949); on who actually coined "fire together, wire together": [Language Log](https://languagelog.ldc.upenn.edu/nll/?p=25194)
- Cornell Chronicle, ["Professor's perceptron paved the way for AI – 60 years too soon"](https://news.cornell.edu/stories/2019/09/professors-perceptron-paved-way-ai-60-years-too-soon) (2019)
- Minsky & Papert, *Perceptrons* (1969); the "sterile" quote: [Quote Investigator](https://quoteinvestigator.com/2026/07/24/perceptron-sterile/)
- Rumelhart, Hinton & Williams, ["Learning representations by back-propagating errors"](https://www.nature.com/articles/323533a0), *Nature* (1986)
- LeCun et al., ["Backpropagation Applied to Handwritten Zip Code Recognition"](https://direct.mit.edu/neco/article/1/4/541/5515/Backpropagation-Applied-to-Handwritten-Zip-Code) (1989)
- [The Nobel Prize in Physics 2024](https://www.nobelprize.org/prizes/physics/2024/summary/)
- Shannon, ["Prediction and Entropy of Printed English"](https://www.princeton.edu/~wbialek/rome/refs/shannon_51.pdf) (1951)
- Bengio et al., ["A Neural Probabilistic Language Model"](https://jmlr.org/papers/v3/bengio03a.html) (2003)
- Vaswani et al., ["Attention Is All You Need"](https://papers.neurips.cc/paper/7181-attention-is-all-you-need.pdf) (2017)
- Brown et al., ["Language Models are Few-Shot Learners"](https://arxiv.org/pdf/2005.14165) (GPT-3, 2020)
- Christiano et al., ["Deep Reinforcement Learning from Human Preferences"](https://arxiv.org/pdf/1706.03741) (2017)
- Ouyang et al., ["Training language models to follow instructions with human feedback"](https://arxiv.org/pdf/2203.02155) (InstructGPT, 2022); *Fortune*, ["OpenAI says it is making progress on A.I.'s 'Alignment Problem'"](https://fortune.com/2022/01/27/openai-alignment-problem-instructgpt-gpt-3/)
- OpenAI, ["Introducing ChatGPT"](https://openai.com/index/chatgpt/) (2022); TechCrunch, ["ChatGPT reaches 900M weekly active users"](https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users) (2026)
- Weizenbaum, *Computer Power and Human Reason* (1976); [Smithsonian Magazine on Weizenbaum and ELIZA](https://www.smithsonianmag.com/history/why-the-computer-scientist-behind-the-worlds-first-chatbot-dedicated-his-life-to-publicizing-the-threat-posed-by-ai-180987971/)
