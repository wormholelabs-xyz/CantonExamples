FROM node:24

ARG TZ
ENV TZ="$TZ"

# Set the locale
ENV LC_ALL=C.UTF-8 LANG=C.UTF-8

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  wget \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Eclipse Temurin JDK 17: required by dpm and the Daml SDK toolchain
# (Canton runs on the JVM). Every daml.yaml in this repo pins sdk-version
# 3.5.1, which this JDK satisfies.
RUN mkdir -p /etc/apt/keyrings && \
  wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release) main" > /etc/apt/sources.list.d/adoptium.list && \
  apt-get update && apt-get install -y --no-install-recommends temurin-17-jdk && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.19.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Override locale: zsh-in-docker hardcodes en_US.UTF-8 earlier in .zshrc
RUN echo 'export LANG=C.UTF-8 LC_ALL=C.UTF-8' >> /home/node/.zshrc

# Install Claude
RUN curl -fsSL https://claude.ai/install.sh | bash

# Copy and set up firewall script (research mode: allow-all, no allowlist file)
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node

# Install Bun
RUN curl -fsSL https://bun.com/install | bash -s "bun-v1.3.14"

# Install dpm (Digital Asset's Daml package manager) and pin the SDK version
# every daml.yaml in this repo declares. Same installer used by the source
# repo's canton CI job (see native-token-transfers .github/workflows/canton.yml).
ENV PATH="/home/node/.dpm/bin:${PATH}"
RUN curl -fsSL https://get.digitalasset.com/install/install.sh | sh && \
  dpm install 3.5.1

# Fix zsh locale
RUN sed -i "s/export LANG='en_US\.UTF-8'/export LANG='C.utf8'/g; s/export LC_ALL='en_US\.UTF-8'/export LC_ALL='C.utf8'/g" ~/.zshrc
