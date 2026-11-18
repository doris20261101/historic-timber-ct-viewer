# Historic Timber CT Viewer — VIC1

A starter **vtk.js web viewer** for a self-contained 3D NRRD file, with 3D rotation, scalar opacity/contrast controls, and a K-direction CT slice slider. It is a prototype, not a calibrated scientific instrument.

## Getting started (GitHub + Vercel, no local coding required)
1. Unzip this folder on your computer.
2. Create a **new** GitHub repository `historic-timber-ct-viewer` (do not modify the working IIIF repository `victory_1`).
3. Click **Add file → Upload files**, and drag **all files from inside the unzipped folder** into the new repository root (not the parent folder). Click Commit changes.
4. On Vercel, Add New → Project → Import the new GitHub repo. Framework preset: **Vite**; Build command: `npm run build`; Output directory: `dist`. Deploy.
5. Create a Cloudflare R2 bucket, upload `VIC1_Web.nrrd`, enable **Public Development URL** for testing, then add a CORS policy allowing `GET`, `HEAD`, `https://your-viewer-domain.vercel.app`, and relevant headers.
6. Visit the viewer URL, paste the R2 public URL for `VIC1_Web.nrrd`, and click **Load CT**.
7. To make it load automatically, change `DEFAULT_NRRD_URL` in `config.js` to the full R2 URL, commit, and let Vercel redeploy.
8. Add an ordinary hyperlink in Exhibit pointing to the viewer URL. Direct embedding depends on Exhibit functionality.

## Technical notes
- Uses vtk.js + fflate for self-contained NRRD files with `raw` or `gzip` encodings and common scalar data types.
- NRRD support here is implemented in `src.js`; vtk.js does not directly parse arbitrary NRRDs.
- Not suitable for detached `.nhdr`, vector-valued, time series, or unusually encoded data.
- NRRD orientations and orientation handling should be visually checked against 3D Slicer; the initial slice view is an axial K slice.
- Client-side decompression temporarily needs memory for the downloaded file AND the decompressed volume. Test on an ordinary laptop/browser before public release.
- The opacity and contrast mappings are illustrative and do not reproduce Slicer's transfer functions automatically.
- Files hosted through public R2 URLs can be read by anyone. Only publish museum research materials if public release is authorized.
- Test with source data representative of internal damage; compare slice appearance with the corresponding slice in Slicer before relying on the viewer in a PhD exhibition.
