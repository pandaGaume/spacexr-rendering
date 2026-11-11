# Generic terrain pipeline

The application supplies source metrics and a surface tiling. The shared 3D Tiles runtime selects and streams tiles; the raster and DEM pyramids provide data; the CPU or GPU Babylon terrain engine presents the selected contents. There is one runtime implementation.

The active projection is Web Mercator parameterized by the supplied geodetic system. Grid resolution, source resolution and selected tile LOD remain separate inputs. Cube implementations and body-specific producers have been removed from this delivery.

Provider URLs, source availability and demonstration locations live in samples. Physical body characteristics are provided by `spacexr-celestial` through a body composition, not inferred by the generic terrain engine. See [architecture](architecture.md), [terrain settings](terrain-settings.md) and the [consumer guide](consume-framework.md).
