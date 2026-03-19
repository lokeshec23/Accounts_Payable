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
  RotateRightOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";

pdfjs.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.mjs";

const PdfViewerWithHighlight = ({ file, highlightedRegions = [] }) => {
  const viewerRef = useRef(null);
  const canvasRef = useRef(null);
  const highlightRef = useRef(null);

  const renderTaskRef = useRef(null);
  const initializedRef = useRef(false);
  const firstAutoFitDoneRef = useRef(false);

  const [pdfObj, setPdfObj] = useState(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [autoFit, setAutoFit] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);

  /* ---------------- Measure container ---------------- */
  useEffect(() => {
    if (!viewerRef.current) return;

    const measure = () => {
      if (!viewerRef.current) return;
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
      firstAutoFitDoneRef.current = false;

      const pdf = await pdfjs.getDocument(file).promise;
      setPdfObj(pdf);
      setPage(1);
      setRotation(0);
      setAutoFit(true);

      await autoFitWidth(pdf, 1, 0);
    })();
  }, [file, containerWidth]);

  /* ---------------- Refit on resize AFTER first load ---------------- */
  useEffect(() => {
    if (!pdfObj || !autoFit || !firstAutoFitDoneRef.current) return;
    autoFitWidth(pdfObj, page, rotation);
  }, [containerWidth]);

  /* ---------------- Helpers ---------------- */
  const getEffectiveRotation = (pageObj, rot = rotation) =>
    ((rot + (pageObj.rotate || 0)) % 360 + 360) % 360;

  const getViewport = (pageObj, scaleVal, rot = rotation) =>
    pageObj.getViewport({
      scale: scaleVal,
      rotation: getEffectiveRotation(pageObj, rot)
    });

  /* ---------------- Render Page ---------------- */
  const renderPage = async (pdf, pageNum, scaleVal, rotationVal = rotation) => {
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

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    renderTaskRef.current = pageObj.render({
      canvasContext: ctx,
      viewport
    });

    await renderTaskRef.current.promise;
    drawHighlights(pageObj, viewport);
  };

  /* ---------------- Draw Highlights ---------------- */
  const drawHighlights = (pageObj, viewport) => {
    if (!highlightRef.current) return;

    const overlay = highlightRef.current;
    overlay.innerHTML = "";
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    const [viewX, viewY, viewW, viewH] = pageObj.view;
    const widthPts = viewW - viewX;
    const heightPts = viewH - viewY;
    const rotation = pageObj.rotate;

    highlightedRegions
      .filter(r => r.page_number === page)
      .forEach(region => {
        let xs = [], ys = [];

        for (let i = 0; i < region.polygon.length; i += 2) {
          const xRaw = region.polygon[i] * 72;
          const yRaw = region.polygon[i + 1] * 72;

          let xPts, yPts;

          switch (rotation) {
            case 90:
              xPts = viewX + yRaw;
              yPts = viewY + xRaw;
              break;
            case 180:
              xPts = viewX + (widthPts - xRaw);
              yPts = viewY + yRaw;
              break;
            case 270:
              xPts = viewX + (widthPts - yRaw);
              yPts = viewY + (heightPts - xRaw);
              break;
            default:
              xPts = viewX + xRaw;
              yPts = viewY + (heightPts - yRaw);
          }

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
        box.style.background = "rgba(255,215,0,0.25)";
        box.style.border = "2px solid rgba(255,165,0,0.9)";
        box.style.pointerEvents = "none";

        overlay.appendChild(box);
      });
  };

  /* ---------------- Auto-scroll to highlight ---------------- */
  const scrollToFirstHighlight = (pageObj, viewport) => {
    if (!viewerRef.current) return;

    const region = highlightedRegions.find(r => r.page_number === page);
    if (!region) return;

    const yInches = region.polygon[1];
    const yPts = (pageObj.view[3] - pageObj.view[1]) - yInches * 72;
    const [, yPx] = viewport.convertToViewportPoint(0, yPts);

    requestAnimationFrame(() => {
      viewerRef.current.scrollTop = Math.max(yPx - 120, 0);
    });
  };

  /* ---------------- Jump to highlighted page (multi-page) ---------------- */
  useEffect(() => {
    if (!pdfObj || !highlightedRegions.length) return;

    const targetPage = highlightedRegions[0]?.page_number;
    if (!targetPage || targetPage === page) return;

    setPage(targetPage);
    autoFit
      ? autoFitWidth(pdfObj, targetPage, rotation)
      : renderPage(pdfObj, targetPage, scale, rotation);
  }, [highlightedRegions]);

  /* ---------------- Highlight redraw + scroll ---------------- */
  useEffect(() => {
    if (!pdfObj || !highlightedRegions.length) return;

    (async () => {
      const pageObj = await pdfObj.getPage(page);
      const viewport = getViewport(pageObj, scale);
      drawHighlights(pageObj, viewport);
      scrollToFirstHighlight(pageObj, viewport);
    })();
  }, [highlightedRegions, page, scale, rotation]);

  /* ---------------- Fit Width ---------------- */
  const autoFitWidth = async (pdf, pageNum, rotationVal = rotation) => {
    const pageObj = await pdf.getPage(pageNum);
    const viewport = getViewport(pageObj, 1, rotationVal);

    const width = viewerRef.current.clientWidth - 20;
    const newScale = width / viewport.width;

    setScale(newScale);
    await renderPage(pdf, pageNum, newScale, rotationVal);

    if (!firstAutoFitDoneRef.current) {
      firstAutoFitDoneRef.current = true;
      viewerRef.current.scrollTop = 0;
    }
  };

  /* ---------------- Controls ---------------- */
  const changePage = d => {
    const next = page + d;
    if (!pdfObj || next < 1 || next > pdfObj.numPages) return;
    setPage(next);
    autoFit
      ? autoFitWidth(pdfObj, next, rotation)
      : renderPage(pdfObj, next, scale, rotation);
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
    autoFit
      ? autoFitWidth(pdfObj, page, r)
      : renderPage(pdfObj, page, scale, r);
  };

  const fitToPage = async () => {
    const pageObj = await pdfObj.getPage(page);
    const viewport = getViewport(pageObj, 1);
    const h = viewerRef.current.clientHeight - 20;
    const s = h / viewport.height;

    setAutoFit(false);
    setScale(s);
    renderPage(pdfObj, page, s, rotation);
  };

  const resetView = () => {
    if (!pdfObj) return;
    setRotation(0);
    setAutoFit(true);
    autoFitWidth(pdfObj, page, 0);
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border-color, #ddd)", background: "var(--bg-content, #fff)", display: "flex", justifyContent: "space-between" }}>
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

          <Tooltip title="Reset View">
            <Button icon={<ReloadOutlined />} onClick={resetView} />
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
