# Age Atlas - MVP PRD

## Vision
Turn time into something you can see and compare.

## Problem
It is hard to understand how different lives unfold relative to each other.

We see people in isolation, not in context.

## Solution
Age Atlas is a simple, playful web app that lets people compare lives within the same moment in time.

Enter a person and an age or a year, and instantly see what they were doing — alongside others who were alive at that same time at completely different life stages.

## Product summary
A user enters a person and an age or a year.

The app shows what that person was doing at that time, how old they were, and six other notable people who were alive in that same year.

## Core user value
The product reveals how different lives overlap in the same moment.

It lets users compare life stages across people:

someone is just starting, someone is at their peak, someone is near the end.

## MVP scope
The MVP includes:
- search input
- two input modes: person + year, person + age
- year-only input
- one main person
- resolved year and age always shown
- one short fact per person (1 line only)
- six contemporaries (always 6)
- one image per person
- click on a contemporary to navigate

## Input rules
- person + year → use year
- person + age → calculate year
- number only → treat as year
- always show both year and age in result

## Output structure
Each result includes:
- main person
- resolved year
- resolved age
- one short fact (1 line)
- one image
- six contemporaries

Each contemporary includes:
- id
- name
- category
- age in that year
- one short fact (1 line)
- one image

## Out of scope
Not included in MVP:
- accounts
- saved history
- timeline slider
- multiple photos
- filters
- long biographies
- multilingual support

## Future ideas
- timeline slider to explore different years of the same person
- ability to jump between life stages quickly
- richer datasets for deeper comparisons