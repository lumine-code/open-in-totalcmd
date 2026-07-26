# open-in-totalcmd

Open files and folders in Total Commander.

Uses the `open-external` service to launch Total Commander.

## Features

- **Open directories**: opens directories in Total Commander instead of system default.
- **Show in folder**: shows any file in Total Commander with file selected.
- **Configurable path**: set custom path to Total Commander executable.

## Installation

To install `open-in-totalcmd` search for _open-in-totalcmd_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/open-in-totalcmd`.

## Usage

The package automatically registers as a handler for the `open-external` service:

- When opening a directory, it opens in Total Commander.
- When showing a file in folder, it opens Total Commander with the file selected.

## Services

- **[open-external](https://lumine-code.github.io/docs.html#services/open-external)** (`^1.0.0`): consumed to register a handler that routes directory opening and show-in-folder operations to Total Commander.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
