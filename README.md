# Home Assistant Configuration

A Home Assistant configuration for running in Docker with basic automations and monitoring capabilities.

## Overview

This repository contains a streamlined Home Assistant setup designed to run in a Docker container. It includes basic configuration, UI customization, and extensible automation capabilities.

## Features

- **Docker Deployment**: Runs in a Docker container with host networking
- **Default Configuration**: Uses Home Assistant's default setup for core features
- **API Access**: Enabled for external integrations
- **Text-to-Speech**: Google Translate TTS support
- **Custom UI**: Lovelace dashboard configuration in `ui-lovelace.yaml`
- **Extensible Structure**: Organized with separate files for automations, scripts, and groups

## Directory Structure

```
.
├── configuration.yaml      # Main configuration file
├── automations.yaml        # Automation rules
├── scripts.yaml           # Custom scripts
├── groups.yaml            # Device groups
├── ui-lovelace.yaml       # Dashboard configuration
├── start.bat              # Docker startup script
├── backups/               # Configuration backups
├── blueprints/            # Automation blueprints
└── www/                   # Static web resources
```

## Technologies

- **Home Assistant**: Open-source home automation platform
- **Docker**: Containerized deployment
- **YAML**: Configuration format
- **Google Translate TTS**: Text-to-speech service

## Installation

### Prerequisites

- Docker installed on your system
- Linux/Unix environment (or Windows with WSL for the start script)

### Deployment

1. Clone this repository:
   ```bash
   git clone https://github.com/DanielBryars/HassConfig.git
   cd HassConfig
   ```

2. Start Home Assistant using Docker:
   ```bash
   ./start.bat
   # Or manually:
   sudo docker run -d --network=host --name home-assistant \
     -v /path/to/HassConfig:/config \
     homeassistant/home-assistant
   ```

3. Access Home Assistant at `http://localhost:8123`

## Configuration

### Basic Setup

The `configuration.yaml` includes:
- Default Home Assistant components
- API and HTTP interfaces
- TTS integration
- Sun sensor for sunrise/sunset
- Includes for automations, scripts, and groups

### Optional Integrations (Commented Out)

The configuration includes templates for:
- **Weather**: DarkSky API integration
- **Solar Monitoring**: SMA inverter monitoring
- **System Monitoring**: Glances integration for Docker, CPU, memory, disk metrics

To enable these, uncomment the relevant sections and provide necessary credentials in `secrets.yaml`.

## Customization

### Adding Automations

Edit `automations.yaml` or use the Home Assistant UI to create automation rules.

### Creating Scripts

Add custom scripts to `scripts.yaml` for reusable automation logic.

### Dashboard Customization

Modify `ui-lovelace.yaml` to customize the web interface layout and cards.

### Adding Integrations

Uncomment and configure additional platforms in `configuration.yaml`:
- Weather services
- Solar monitoring
- System metrics
- Custom sensors

## Docker Configuration

The Docker setup uses:
- **Network Mode**: Host networking for easy device discovery
- **Volume Mount**: `/ha/hass-config:/config` (adjust path as needed)
- **Image**: Official `homeassistant/home-assistant`

## Backups

The `backups/` directory can store configuration snapshots. Regularly backup your configuration files.

## Blueprints

The `blueprints/` directory contains automation blueprints for quick deployment of common automation patterns.

## Security Considerations

- Store sensitive information (API keys, passwords) in `secrets.yaml` (not tracked in git)
- Use strong passwords for user accounts
- Consider HTTPS if exposing to the internet
- Keep Home Assistant updated regularly

## Status

Active Home Assistant configuration with room for expansion and customization.

## Related Repositories

- [HomeAutomation](https://github.com/DanielBryars/HomeAutomation) - Alternative/older Home Assistant setup
- [HA2](https://github.com/DanielBryars/HA2) - Next generation configuration (planned)
