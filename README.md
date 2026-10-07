# Countersign

A working concept: a rep types a deal in plain words, an agent drafts the quote, and a separate check works the price out again and decides who has to sign. The agent never approves its own discount.

The company, the prices and the rules are made up.

## How it is put together

- `src/pricebook.js` holds the prices and the approval rules.
- `src/reader.js` turns the sentence into a structured request. Here it is a small set of rules so the page runs in a browser with no server. In a real system a language model sits in this seat.
- `src/quote.js` is the agent's side: it builds the quote. It can be told to make a mistake on purpose.
- `src/check.js` is separate code that trusts nothing it is given. It works the price out again from the price book, compares, and routes the quote to the people who have to approve it.
- `src/app.js` is the page: the quote sheet, the route drawing and the trail.

## Run it

    python -m http.server 9420
    node --test test/check.test.js

The tests include a sweep of more than 4,000 deals through the quote builder and the check, which fails if the two ever disagree.

Built by Angel Valle Jr.
