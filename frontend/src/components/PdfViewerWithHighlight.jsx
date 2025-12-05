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

// 🔥 Ensures PDF.js does NOT rotate pages unexpectedly
// pdfjs.disableAutoRotate = true;

const PdfViewerWithHighlight = ({ file, highlightedRegions = [] }) => {
    const viewerRef = useRef(null);            // scroll + resizing container
    const canvasContainerRef = useRef(null);   // actual canvas wrapper
    const canvasRef = useRef(null);            // main canvas
    const highlightRef = useRef(null);         // highlight overlay

    const [pdfObj, setPdfObj] = useState(null);
    const [page, setPage] = useState(1);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0); // user rotation only
    const [autoFit, setAutoFit] = useState(false);
    const [containerWidth, setContainerWidth] = useState(0);

    const initialRenderDoneRef = useRef(false);
    const pdfLoadedRef = useRef(false);

    /* -----------------------------------------
     * Measure viewer width (supports resizable panel)
     * ----------------------------------------- */
    useEffect(() => {
        if (!viewerRef.current) return;

        const measure = () => {
            const width = viewerRef.current.clientWidth;
            if (width > 0) setContainerWidth(width);
        };

        measure();

        const ro = new ResizeObserver(measure);
        ro.observe(viewerRef.current);

        return () => ro.disconnect();
    }, []);

    /* -----------------------------------------
     * Load PDF after viewer width becomes available
     * ----------------------------------------- */
    useEffect(() => {
        if (!file || !containerWidth || pdfLoadedRef.current) return;

        const loadPDF = async () => {
            try {
                pdfLoadedRef.current = true;

                const task = pdfjs.getDocument(file);
                const loaded = await task.promise;

                setPdfObj(loaded);
                setPage(1);
                setRotation(0);
                setAutoFit(true);

                // First render at scale 1 (stabilizes canvas size)
                await renderPage(loaded, 1, 1, 0);

                // Wait for DOM stabilization
                await new Promise(res => requestAnimationFrame(res));

                // Now apply auto-fit
                await autoFitWidth(loaded, 1, 0);

                initialRenderDoneRef.current = true;
            } catch (err) {
                console.error("PDF load error:", err);
            }
        };

        loadPDF();
    }, [file, containerWidth]);

    /* -----------------------------------------
     * Auto-fit when viewer width changes (e.g., divider drag)
     * ----------------------------------------- */
    useEffect(() => {
        if (!initialRenderDoneRef.current || !autoFit || !pdfObj) return;

        const t = setTimeout(() => {
            autoFitWidth(pdfObj, page, rotation);
        }, 50);

        return () => clearTimeout(t);
    }, [containerWidth]);

    /* -----------------------------------------
     * Update highlights only
     * ----------------------------------------- */
    useEffect(() => {
        if (!pdfObj || !initialRenderDoneRef.current) return;

        (async () => {
            const pageObj = await pdfObj.getPage(page);
            const viewport = pageObj.getViewport({
                scale,
                rotation
            });
            drawHighlights(pageObj, viewport, page);
        })();
    }, [highlightedRegions, scale, rotation, page]);

    /* -----------------------------------------
 * Render page (HIGH-DPI sharp quality mode)
 * ----------------------------------------- */
    const renderPage = async (pdf, pageNum, scaleVal, rotationVal) => {
        try {
            const pageObj = await pdf.getPage(pageNum);

            const finalRotation = rotationVal;
            const viewport = pageObj.getViewport({
                scale: scaleVal,
                rotation: finalRotation,
            });

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            // HIGH-DPI FIX -------------------------------------------------
            const deviceScale = window.devicePixelRatio || 1;

            canvas.width = viewport.width * deviceScale;
            canvas.height = viewport.height * deviceScale;

            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
            // ---------------------------------------------------------------

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            await pageObj.render({ canvasContext: ctx, viewport }).promise;

            drawHighlights(pageObj, viewport, pageNum);
        } catch (err) {
            console.error("Render error:", err);
        }
    };
    /* -----------------------------------------
     * Draw highlights (APPLY PDF ROTATION HERE ONLY)
     * ----------------------------------------- */
    const drawHighlights = (pageObj, viewport, pageNum) => {
        if (!highlightRef.current) return;

        const overlay = highlightRef.current;
        overlay.innerHTML = "";

        const internalRotation = pageObj.rotate || 0;

        // 🔥 FIX: use user rotation + pdf internal rotation
        const totalRotation = (rotation + internalRotation) % 360;

        const rotatedViewport = pageObj.getViewport({
            scale: viewport.scale,
            rotation: totalRotation,
        });

        const pageHeightPts = pageObj.view[3] || 792;
        const regions = highlightedRegions.filter(r => r.page_number === pageNum);

        regions.forEach(region => {
            let xs = [], ys = [];

            for (let i = 0; i < region.polygon.length; i += 2) {
                const xPt = region.polygon[i] * 72;
                const yPt = pageHeightPts - region.polygon[i + 1] * 72;

                const [vx, vy] = rotatedViewport.convertToViewportPoint(xPt, yPt);
                xs.push(vx);
                ys.push(vy);
            }

            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.left = `${Math.min(...xs)}px`;
            box.style.top = `${Math.min(...ys)}px`;
            box.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
            box.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;
            box.style.backgroundColor = "rgba(144, 238, 144, 0.35)";
            box.style.border = "1px solid rgba(50,205,50,0.9)";
            box.style.pointerEvents = "none";

            overlay.appendChild(box);
        });
    };


    /* -----------------------------------------
     * Auto-fit to viewer width
     * ----------------------------------------- */
    const autoFitWidth = async (pdf, pageNum, rotationVal) => {
        if (!viewerRef.current) return;

        const width = viewerRef.current.clientWidth;
        if (width <= 0) return;

        const pageObj = await pdf.getPage(pageNum);
        const viewportTest = pageObj.getViewport({
            scale: 1,
            rotation: rotationVal,
        });

        const newScale = (width - 20) / viewportTest.width;

        setScale(newScale);
        await renderPage(pdf, pageNum, newScale, rotationVal);
    };

    /* -----------------------------------------
     * Navigation
     * ----------------------------------------- */
    const changePage = delta => {
        if (!pdfObj) return;

        const next = page + delta;
        if (next < 1 || next > pdfObj.numPages) return;

        setPage(next);

        if (autoFit) autoFitWidth(pdfObj, next, rotation);
        else renderPage(pdfObj, next, scale, rotation);
    };

    /* -----------------------------------------
     * Zoom
     * ----------------------------------------- */
    const zoom = amount => {
        if (!pdfObj) return;

        setAutoFit(false);
        const newScale = Math.max(0.3, scale + amount);

        setScale(newScale);
        renderPage(pdfObj, page, newScale, rotation);
    };

    /* -----------------------------------------
     * Rotation
     * ----------------------------------------- */
    const rotate = deg => {
        if (!pdfObj) return;

        const newRotation = (rotation + deg + 360) % 360;
        setRotation(newRotation);

        if (autoFit) autoFitWidth(pdfObj, page, newRotation);
        else renderPage(pdfObj, page, scale, newRotation);
    };

    /* -----------------------------------------
     * Fit page height
     * ----------------------------------------- */
    const fitToPage = async () => {
        if (!pdfObj || !viewerRef.current) return;

        const height = viewerRef.current.clientHeight;

        const pageObj = await pdfObj.getPage(page);

        const viewportTest = pageObj.getViewport({
            scale: 1,
            rotation,
        });

        const newScale = (height - 20) / viewportTest.height;

        setScale(newScale);
        setAutoFit(false);

        renderPage(pdfObj, page, newScale, rotation);
    };

    /* -----------------------------------------
     * UI
     * ----------------------------------------- */
    return (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>

            {/* Toolbar */}
            <div
                style={{
                    padding: "6px 10px",
                    background: "#fff",
                    borderBottom: "1px solid #ddd",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" icon={<LeftOutlined />} onClick={() => changePage(-1)} />
                    <Button size="small" icon={<RightOutlined />} onClick={() => changePage(1)} />
                    <span>Page {page} / {pdfObj?.numPages || "--"}</span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                    <Button size="small" icon={<RotateLeftOutlined />} onClick={() => rotate(-90)} />
                    <Button size="small" icon={<RotateRightOutlined />} onClick={() => rotate(90)} />
                    <Button size="small" icon={<MinusOutlined />} onClick={() => zoom(-0.2)} />
                    <Button size="small" icon={<PlusOutlined />} onClick={() => zoom(0.2)} />

                    <Tooltip title="Fit to Width">
                        <Button
                            size="small"
                            icon={<ColumnWidthOutlined />}
                            type={autoFit ? "primary" : "default"}
                            onClick={() => {
                                setAutoFit(true);
                                if (pdfObj) autoFitWidth(pdfObj, page, rotation);
                            }}
                        />
                    </Tooltip>

                    <Tooltip title="Fit to Page Height">
                        <Button size="small" icon={<FullscreenOutlined />} onClick={fitToPage} />
                    </Tooltip>

                    <span style={{ minWidth: 50, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
                </div>
            </div>

            {/* Viewer */}
            <div
                ref={viewerRef}
                style={{
                    flex: 1,
                    overflow: "auto",
                    position: "relative",
                    background: "#ffffff",
                    display: "block",      // critical for zoom scrolling
                }}
            >
                <div
                    ref={canvasContainerRef}
                    style={{ display: "inline-block", position: "relative" }}
                >
                    <canvas ref={canvasRef} />
                    <div
                        ref={highlightRef}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            pointerEvents: "none",
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default PdfViewerWithHighlight;

