# A Github Action ADR workflow tool

This project is focused around building a workflow tool to facilitate the creation of MADRs while
also enabling a review process. The challenge that I've found with the ADR process is that it lacks
a formal review and sign-off.

The sign-off is meant to be casual and just give readers reassurance that the decision log they are
reading was a discussion and not a single persons perspective. One could implement this process
using the Pull Request model however using Issues has two major benefits.

1. Enforce uniform styling and data structure
1. Limiting editing of committed decision logs

There are some significant challenges mainly involved with more detailed conversation and wordy
decision logs. In this case the PR would be a better fit since people could engage with the
contribution, line by line.

## Features

1. Simple MADR process utilizing Github Issues and comments
1. Enforce organization style by utilizing Issue templates
1. Increase engagement by removing the need to checkout repo
1. Initialization script to get up an running quickly

## Roadmap

**Planned**

- Hosted version for faster actions

**Consideration**

- More customization
- Prettier interface (i.e. Hermes)