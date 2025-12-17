import React, { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import {
  LeftOutlined,
  RightOutlined,
  PlusOutlined,
  MinusOutlined,
  FullscreenOutlined,
  ColumnWidthOutlined,
  RotateLeftOutlined,
  RotateRightOutlined
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

pdfjs.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.mjs";

const PdfViewerWithHighlight = ({ file, highlightedRegions = [] }) => {
  const viewerRef = useRef(null);
  const canvasRef = useRef(null);
  const highlightRef = useRef(null);

  const [pdfObj, setPdfObj] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [autoFit, setAutoFit] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);

  const initializedRef = useRef(false);

  /* ---------------- Measure container ---------------- */
  useEffect(() => {
    if (!viewerRef.current) return;

    const measure = () => {
      const w = viewerRef.current.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewerRef.current);

    return () => ro.disconnect();
  }, []);

  /* ---------------- Load PDF ---------------- */
  useEffect(() => {
    if (!file || !containerWidth || initializedRef.current) return;

    (async () => {
      initializedRef.current = true;

      const pdf = await pdfjs.getDocument(file).promise;
      setPdfObj(pdf);
      setPage(1);
      setRotation(0);
      setAutoFit(true);

      await autoFitWidth(pdf, 1, 0);
    })();
  }, [file, containerWidth]);

  /* ---------------- Refit on resize ---------------- */
  useEffect(() => {
    if (!pdfObj || !autoFit) return;
    autoFitWidth(pdfObj, page, rotation);
  }, [containerWidth]);

  /* ---------------- Highlight redraw ---------------- */
  useEffect(() => {
    if (!pdfObj) return;

    (async () => {
      const pageObj = await pdfObj.getPage(page);
      const viewport = getViewport(pageObj, scale, rotation);
      drawHighlights(pageObj, viewport);
    })();
  }, [highlightedRegions, scale, rotation, page]);

  /* ---------------- Helpers ---------------- */

  const getEffectiveRotation = pageObj =>
    ((rotation + (pageObj.rotate || 0)) % 360 + 360) % 360;

  const getViewport = (pageObj, scaleVal, rotationVal) =>
    pageObj.getViewport({
      scale: scaleVal,
      rotation: getEffectiveRotation(pageObj)
    });

  /* ---------------- Render Page ---------------- */
  const renderPage = async (pdf, pageNum, scaleVal, rotationVal) => {
    const pageObj = await pdf.getPage(pageNum);
    const viewport = getViewport(pageObj, scaleVal, rotationVal);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await pageObj.render({ canvasContext: ctx, viewport }).promise;

    drawHighlights(pageObj, viewport);
  };

  /* ---------------- Draw Azure Highlights ---------------- */
  /* ---------------- Draw Azure Highlights ---------------- */
/* ---------------- Draw Azure Highlights ---------------- */
  const drawHighlights = (pageObj, viewport) => {
    if (!highlightRef.current) return;

    const overlay = highlightRef.current;
    overlay.innerHTML = "";
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    // 1. Get raw PDF dimensions and offsets
    const [viewX, viewY, viewW, viewH] = pageObj.view; 
    const widthPts = viewW - viewX;
    const heightPts = viewH - viewY;
    
    // 2. Get the internal PDF rotation
    const rotation = pageObj.rotate; 

    const regions = highlightedRegions.filter(r => r.page_number === page);

    regions.forEach(region => {
      let xs = [], ys = [];

      for (let i = 0; i < region.polygon.length; i += 2) {
        const xInches = region.polygon[i];
        const yInches = region.polygon[i + 1];
        
        // Convert inches to points
        const xRaw = xInches * 72;
        const yRaw = yInches * 72;

        let xPts, yPts;

        // 3. Coordinate Transformation based on Rotation
        // Azure is always Top-Left based. We must map that to PDF Bottom-Left based on rotation.
        switch (rotation) {
          case 90:
            // Visual Top-Left is PDF Bottom-Left (rotated)
            // Azure X -> PDF Y
            // Azure Y -> PDF X
            xPts = viewX + yRaw; 
            yPts = viewY + xRaw; 
            break;

          case 180:
            // Visual Top-Left is PDF Top-Right
            xPts = viewX + (widthPts - xRaw);
            yPts = viewY + yRaw;
            break;

          case 270:
            // Visual Top-Left is PDF Top-Right (rotated)
            // Azure X -> PDF Y (inverted)
            // Azure Y -> PDF X (inverted)
            xPts = viewX + (widthPts - yRaw);
            yPts = viewY + (heightPts - xRaw);
            break;

          case 0:
          default:
            // Standard PDF: Origin is Bottom-Left
            xPts = viewX + xRaw;
            yPts = viewY + (heightPts - yRaw);
            break;
        }

        // 4. Convert to Viewport (Pixels)
        const [vx, vy] = viewport.convertToViewportPoint(xPts, yPts);
        xs.push(vx);
        ys.push(vy);
      }

      const box = document.createElement("div");
      box.style.position = "absolute";
      box.style.left = `${Math.min(...xs)}px`;
      box.style.top = `${Math.min(...ys)}px`;
      box.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
      box.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;
      
      // Styling
      box.style.background = "rgba(255, 215, 0, 0.2)"; 
      box.style.border = "2px solid rgba(255, 165, 0, 0.8)";
      box.style.pointerEvents = "none";
      box.style.zIndex = "10";

      overlay.appendChild(box);
    });
  };

  /* ---------------- Fit Width ---------------- */
  const autoFitWidth = async (pdf, pageNum, rotationVal) => {
    const pageObj = await pdf.getPage(pageNum);
    const viewport = getViewport(pageObj, 1, rotationVal);

    const width = viewerRef.current.clientWidth - 20;
    const newScale = width / viewport.width;

    setScale(newScale);
    await renderPage(pdf, pageNum, newScale, rotationVal);
  };

  /* ---------------- Controls ---------------- */
  const changePage = d => {
    const next = page + d;
    if (!pdfObj || next < 1 || next > pdfObj.numPages) return;
    setPage(next);
    autoFit ? autoFitWidth(pdfObj, next, rotation) : renderPage(pdfObj, next, scale, rotation);
  };

  const zoom = d => {
    setAutoFit(false);
    const s = Math.max(0.3, scale + d);
    setScale(s);
    renderPage(pdfObj, page, s, rotation);
  };

  const rotate = d => {
    const r = (rotation + d + 360) % 360;
    setRotation(r);
    autoFit ? autoFitWidth(pdfObj, page, r) : renderPage(pdfObj, page, scale, r);
  };

  const fitToPage = async () => {
    const pageObj = await pdfObj.getPage(page);
    const viewport = getViewport(pageObj, 1, rotation);
    const h = viewerRef.current.clientHeight - 20;
    const s = h / viewport.height;

    setAutoFit(false);
    setScale(s);
    renderPage(pdfObj, page, s, rotation);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 8, borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between" }}>
        <div>
          <Button icon={<LeftOutlined />} onClick={() => changePage(-1)} />
          <Button icon={<RightOutlined />} onClick={() => changePage(1)} />
          <span style={{ marginLeft: 8 }}>
            Page {page}/{pdfObj?.numPages}
          </span>
        </div>

        <div>
          <Button icon={<RotateLeftOutlined />} onClick={() => rotate(-90)} />
          <Button icon={<RotateRightOutlined />} onClick={() => rotate(90)} />
          <Button icon={<MinusOutlined />} onClick={() => zoom(-0.2)} />
          <Button icon={<PlusOutlined />} onClick={() => zoom(0.2)} />

          <Tooltip title="Fit Width">
            <Button
              icon={<ColumnWidthOutlined />}
              type={autoFit ? "primary" : "default"}
              onClick={() => {
                setAutoFit(true);
                autoFitWidth(pdfObj, page, rotation);
              }}
            />
          </Tooltip>

          <Tooltip title="Fit Page">
            <Button icon={<FullscreenOutlined />} onClick={fitToPage} />
          </Tooltip>

          <span style={{ marginLeft: 8 }}>{Math.round(scale * 100)}%</span>
        </div>
      </div>

      <div ref={viewerRef} style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <canvas ref={canvasRef} />
          <div ref={highlightRef} style={{ position: "absolute", top: 0, left: 0 }} />
        </div>
      </div>
    </div>
  );
};

export default PdfViewerWithHighlight;
