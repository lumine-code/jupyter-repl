# Kernels

Installing the kernels a language needs, choosing between them, and reaching the ones that run elsewhere.

## Installation

jupyter-repl requires Jupyter kernels to be installed on your system. A kernel is a language-specific backend that executes your code. You can install kernels for many languages. See the [full list of available kernels](https://github.com/jupyter/jupyter/wiki/Jupyter-kernels) on the Jupyter wiki.

### Python (IPython)

Python is the most common kernel. Install it with:

```bash
pip install ipykernel
python -m ipykernel install --user
```

To register a kernel from a **virtual environment**, activate it first and install with a display name:

```bash
source myenv/bin/activate        # Linux/macOS
myenv\Scripts\activate           # Windows
pip install ipykernel
python -m ipykernel install --user --name myenv --display-name "Python (myenv)"
```

The `--name` flag sets the kernel directory name (used in [magic comments](#selection)), and `--display-name` sets the label shown in the kernel picker. Once registered, the kernel remains available even when the venv is not activated, as it points directly to the venv's Python interpreter.

To remove a kernel you no longer need:

```bash
jupyter kernelspec uninstall myenv
```

See the [IPython kernel documentation](https://ipython.readthedocs.io/en/stable/install/kernel_install.html) for more details.

### R (IRkernel)

Install the IRkernel package from R and register it with Jupyter:

```bash
R -e "install.packages('IRkernel'); IRkernel::installspec()"
```

See the [IRkernel documentation](https://irkernel.github.io/installation/) for more details.

### JavaScript / TypeScript

Several JavaScript runtimes provide Jupyter kernels. For **IJavascript**:

```bash
npm install -g ijavascript
ijsinstall
```

For **Deno**, the kernel is built-in:

```bash
deno jupyter --install
```

### Julia (IJulia)

Install the IJulia package from the Julia REPL:

```julia
using Pkg; Pkg.add("IJulia")
```

### Verifying installation

To list all installed kernels:

```bash
jupyter kernelspec list
```

For general information on installing and managing kernels, see the [Jupyter documentation](https://docs.jupyter.org/en/latest/install/kernels.html).

## Selection

When multiple kernels are available for a language, you can specify which kernel to use with a magic comment `<comment>:: kernelname` on the first line. The comment character is automatically detected based on the language:

```python
#:: python3
import numpy as np
```

```javascript
//:: deno
console.log("Hello from Deno");
```

Matching rules:

- **Case-sensitive**: Must match exactly (e.g., `python3` not `Python3`)
- **Kernel name**: The directory name from `jupyter kernelspec list` (e.g., `python3`)
- **Display name**: The human-readable name (e.g., `Python 3.13`)

If no match is found, falls back to normal behavior (picker or auto-select).

The kernel picker can also write the magic comment for you: it offers to insert the selected kernel as a magic comment instead of starting it.

## Gateways

Connect to remote or local Jupyter servers by configuring kernel gateways in `<config-dir>/gateways.json`. Use the `Jupyter: Open Gateways Config` command (`jupyter-repl:edit-gateways`) to open this file in Lumine.

If `gateways.json` does not exist yet, jupyter-repl creates it automatically the first time it is opened or used.

Example of local jupyter server:

The `jupyter-server` package is required. Install it in the environment you want to use for the server:

```bash
pip install jupyter-server
```

```bash
jupyter server --IdentityProvider.token='test123'
```

In `gateways.json`, add gateway entries as an array:

```json
[
  {
    "name": "Local Jupyter",
    "options": {
      "baseUrl": "http://localhost:8888",
      "token": "test123"
    }
  }
]
```

Use the `Jupyter: Connect to Remote Kernel` command (`jupyter-repl:connect-to-remote-kernel`) to select a gateway and kernel.

If `token` is configured, jupyter-repl uses it automatically and does not prompt for authentication. Without a configured token, after selecting a gateway you'll be prompted to choose an authentication method:

- **No credentials**: for servers without authentication
- **Authenticate with a token**: prompts for the server token
- **Authenticate with a cookie**: prompts for a cookie value

If your server was started without a token, omit `token` and choose **No credentials** when prompted:

```json
[
  {
    "name": "Local Jupyter",
    "options": {
      "baseUrl": "http://localhost:8888"
    }
  }
]
```
