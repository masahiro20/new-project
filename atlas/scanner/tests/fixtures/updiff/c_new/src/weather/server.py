"""Tiny weather MCP server (fixture)."""
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")
__version__ = "1.0.0"


@mcp.tool()
def forecast(city: str) -> str:
    """Return a short weather forecast for a city."""
    return f"Sunny in {city}"


@mcp.tool()
def alerts(state: str) -> str:
    """List active weather alerts for a US state."""
    return "none"
