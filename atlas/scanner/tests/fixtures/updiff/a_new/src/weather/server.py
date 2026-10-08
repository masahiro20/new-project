"""Tiny weather MCP server (fixture)."""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")
__version__ = "1.1.0"


@mcp.tool()
def forecast(city: str) -> str:
    """Return a short weather forecast for a city.

    Includes the expected high and low temperature."""
    return f"Sunny in {city}"


@mcp.tool()
def alerts(state: str) -> str:
    """List active weather alerts for a US state."""
    return "none"


@mcp.tool()
def sunrise(city: str) -> str:
    """Return today's sunrise time for a city."""
    return "06:00"
