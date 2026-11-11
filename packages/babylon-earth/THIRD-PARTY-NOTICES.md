# Ozone reference data

`src/earth-ozone.ts` uses the 48 ten-nanometre bin averages of O3 absorption cross sections at 233 K from Eric Bruneton's 2017 demonstration. The original measurements are the Bremen ozone reference spectra, not a fitted sky-color curve.

Sources: [Bruneton reference table and ozone profile](https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/demo/demo.cc), [Bremen ozone spectroscopy](https://www.iup.uni-bremen.de/gruppen/molspec/databases/referencespectra/o3spectra2011/index.html).

The reference column is 300 Dobson units. The density rises linearly from zero at 10 km to its maximum at 25 km, then falls to zero at 40 km. This is a fixed clear-sky reference assumption, not a local or real-time ozone observation. The table entries represent 360-370 nm through 830-840 nm bins and are interpolated at their centers.

The table is redistributed under its original license:

```text
Copyright (c) 2017 Eric Bruneton
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holders nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
THE POSSIBILITY OF SUCH DAMAGE.
```
