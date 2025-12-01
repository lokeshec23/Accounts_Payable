import React, { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import {
    LeftOutlined,
    RightOutlined,
    PlusOutlined,
    MinusOutlined,
    FullscreenOutlined,
    RotateLeftOutlined,
    RotateRightOutlined
} from "@ant-design/icons";

GlobalWorkerOptions.workerSrc = pdfWorker;

const PdfViewerWithHighlight = ({ file, extractedData }) => {
    const viewerRef = useRef(null);
    const canvasRef = useRef(null);
    const highlightRef = useRef(null);
    const renderTaskRef = useRef(null);

    const [pdf, setPdf] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
    const [initialAutoFitDone, setInitialAutoFitDone] = useState(false);
    const [overflowX, setOverflowX] = useState("auto");

    // Track previous width to only trigger resize on width changes
    const prevWidthRef = useRef(0);

    // ------------------------------------------------------------
    // Collect all bounding box regions
    // ------------------------------------------------------------
    const extractRegions = () => {
        const list = [];
        const scan = (obj) => {
            if (!obj || typeof obj !== "object") return;

            if (Array.isArray(obj.bounding_regions)) {
                obj.bounding_regions.forEach((r) => {
                    if (r.page_number && r.polygon?.length >= 8) {
                        list.push(r);
                    }
                });
            }
            Object.values(obj).forEach(scan);
        };
        scan(extractedData);
        return list;
    };

    const allRegions = extractRegions();

    // ------------------------------------------------------------
    // Load PDF
    // ------------------------------------------------------------
    useEffect(() => {
        if (!file) return;

        // Reset state for new file
        setPageNum(1);
        setRotation(0);
        setInitialAutoFitDone(false);
        setOverflowX("auto");
        prevWidthRef.current = viewerRef.current?.clientWidth || 0;

        const loadPdf = async () => {
            try {
                // Cancel any existing render task before loading new PDF
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }

                const loadingTask = getDocument(file);
                const loadedPdf = await loadingTask.promise;
                setPdf(loadedPdf);

                // Calculate initial auto-fit scale
                const page = await loadedPdf.getPage(1);
                const pageRotation = page.rotation || 0;
                const computedRotation = (pageRotation + 0) % 360; // Initial rotation
                console.log(`PDF Page 1 Rotation: ${computedRotation}`);

                // Set initial scale to 86% as requested
                setScale(0.86);
                setInitialAutoFitDone(true);

                // Render first page
                renderPage(loadedPdf, 1, 0.86, 0);
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };

        loadPdf();

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
        };
    }, [file]);

    // ------------------------------------------------------------
    // Auto-Resize Observer
    // ------------------------------------------------------------
    const isFirstResize = useRef(true);

    useEffect(() => {
        const container = viewerRef.current;
        if (!container || !pdf) return;

        // Reset first resize flag when PDF changes
        isFirstResize.current = true;

        let resizeTimeout;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = entry.contentRect.width;

            // Skip if width hasn't changed significantly (prevents loop with scrollbars)
            if (Math.abs(width - prevWidthRef.current) < 1) {
                return;
            }

            // Update previous width
            prevWidthRef.current = width;

            // Skip the very first resize trigger (which happens on mount) 
            // to preserve the initial 0.86 scale
            if (isFirstResize.current) {
                isFirstResize.current = false;
                return;
            }

            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                fitToWidth();
            }, 200);
        });

        observer.observe(container);

        return () => {
            observer.disconnect();
            clearTimeout(resizeTimeout);
        };
    }, [pdf, pageNum, rotation]);

    // ------------------------------------------------------------
    // Render PDF Page
    // ------------------------------------------------------------
    const renderPage = async (pdfDoc, pageNumber, zoomScale, rot) => {
        if (!pdfDoc) return;

        // Cancel previous render if it's still running
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        try {
            const page = await pdfDoc.getPage(pageNumber);
            const pageRotation = page.rotation || 0;
            const totalRotation = (pageRotation + rot) % 360;

            const viewport = page.getViewport({
                scale: zoomScale,
                rotation: totalRotation,
            });

            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext("2d");

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport,
            };

            const renderTask = page.render(renderContext);
            renderTaskRef.current = renderTask;

            await renderTask.promise;
            renderTaskRef.current = null; // Clear ref when done

            // Overlay
            const overlay = highlightRef.current;
            if (overlay) {
                overlay.innerHTML = "";
                overlay.style.width = `${viewport.width}px`;
                overlay.style.height = `${viewport.height}px`;
                drawHighlights(viewport, pageNumber, page);
            }

        } catch (error) {
            if (error.name === 'RenderingCancelledException') {
                // Ignore cancelled renders
                return;
            }
            console.error("Error rendering page:", error);
        }
    };

    // ------------------------------------------------------------
    // Draw Highlights
    // ------------------------------------------------------------
    const drawHighlights = (viewport, pageNumber, page) => {
        const overlay = highlightRef.current;
        if (!overlay) return;

        // PDF point conversion (72 DPI)
        // We need the page height in points to flip the Y coordinate
        // page.view is [x, y, w, h] in points. usually [0, 0, 612, 792] for letter
        const pageView = page.view;
        const pageHeightPoints = pageView ? (pageView[3] - pageView[1]) : 792;

        const relevant = allRegions.filter((r) => r.page_number === pageNumber);

        relevant.forEach((reg) => {
            const p = reg.polygon; // [x1, y1, x2, y2, ...] in inches (top-left origin)

            const xs = [];
            const ys = [];

            for (let i = 0; i < p.length; i += 2) {
                const xInch = p[i];
                const yInch = p[i + 1];

                // Convert inches (top-left) to PDF points (bottom-left)
                const xPt = xInch * 72;
                const yPt = pageHeightPoints - (yInch * 72);

                // Transform to viewport coordinates (pixels, top-left)
                // This handles the rotation automatically
                const [vx, vy] = viewport.convertToViewportPoint(xPt, yPt);

                xs.push(vx);
                ys.push(vy);
            }

            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const w = Math.max(...xs) - x;
            const h = Math.max(...ys) - y;

            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.left = `${x}px`;
            box.style.top = `${y}px`;
            box.style.width = `${w}px`;
            box.style.height = `${h}px`;

            // super light green highlight
            box.style.background = "rgba(144, 238, 144, 0.35)";
            box.style.border = "2px solid rgba(60, 179, 113, 0.9)";
            box.style.pointerEvents = "none";

            overlay.appendChild(box);
        });
    };

    // ------------------------------------------------------------
    // Page Navigation
    // ------------------------------------------------------------
    const nextPage = () => {
        if (pdf && pageNum < pdf.numPages) {
            const newPage = pageNum + 1;
            setPageNum(newPage);
            renderPage(pdf, newPage, scale, rotation);
        }
    };

    const prevPage = () => {
        if (pdf && pageNum > 1) {
            const newPage = pageNum - 1;
            setPageNum(newPage);
            renderPage(pdf, newPage, scale, rotation);
        }
    };

    // ------------------------------------------------------------
    // Zoom Controls (enable horizontal scroll after zoom)
    // ------------------------------------------------------------
    const zoomIn = () => {
        setOverflowX("auto");
        const newScale = scale + 0.2;
        setScale(newScale);
        renderPage(pdf, pageNum, newScale, rotation);
    };

    const zoomOut = () => {
        setOverflowX("auto");
        const newScale = Math.max(0.4, scale - 0.2);
        setScale(newScale);
        renderPage(pdf, pageNum, newScale, rotation);
    };

    // ------------------------------------------------------------
    // Rotation Controls
    // ------------------------------------------------------------
    const rotateLeft = () => {
        const newRotation = (rotation - 90 + 360) % 360;
        setRotation(newRotation);
        renderPage(pdf, pageNum, scale, newRotation);
    };

    const rotateRight = () => {
        const newRotation = (rotation + 90) % 360;
        setRotation(newRotation);
        renderPage(pdf, pageNum, scale, newRotation);
    };

    // ------------------------------------------------------------
    // Fit Entire Page
    // ------------------------------------------------------------
    const fitToPage = async () => {
        if (!pdf) return;
        setOverflowX("hidden");

        const page = await pdf.getPage(pageNum);
        const pageRotation = page.rotation || 0;
        const totalRotation = (pageRotation + rotation) % 360;
        const base = page.getViewport({ scale: 1, rotation: totalRotation });

        const viewerWidth = viewerRef.current?.clientWidth || 800;
        const viewerHeight = viewerRef.current?.clientHeight || 600;

        const scaleW = viewerWidth / base.width;
        const scaleH = viewerHeight / base.height;

        const final = Math.min(scaleW, scaleH);

        setScale(final);
        renderPage(pdf, pageNum, final, rotation);
    };

    const fitToWidth = async () => {
        if (!pdf) return;
        setOverflowX("hidden");

        const page = await pdf.getPage(pageNum);
        const pageRotation = page.rotation || 0;
        const totalRotation = (pageRotation + rotation) % 360;
        const base = page.getViewport({ scale: 1, rotation: totalRotation });

        const viewerWidth = viewerRef.current?.clientWidth || 800;
        const scaleW = viewerWidth / base.width;

        setScale(scaleW);
        renderPage(pdf, pageNum, scaleW, rotation);
    };

    // ------------------------------------------------------------
    // UI
    // ------------------------------------------------------------
    return (
        <div style={{ width: "100%", height: "100%", position: "relative" }}>

            {/* Toolbar */}
            <div
                style={{
                    padding: "6px 10px",
                    background: "#fff",
                    borderBottom: "1px solid #ddd",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}
            >
                <div>
                    <button onClick={prevPage} disabled={!pdf || pageNum === 1}>
                        <LeftOutlined />
                    </button>

                    <button
                        onClick={nextPage}
                        disabled={!pdf || pageNum === pdf?.numPages}
                        style={{ marginLeft: 10 }}
                    >
                        <RightOutlined />
                    </button>

                    <span style={{ marginLeft: 16 }}>
                        Page {pageNum} / {pdf?.numPages || "--"}
                    </span>
                </div>

                <div>
                    <button onClick={rotateLeft} title="Rotate Left">
                        <RotateLeftOutlined />
                    </button>
                    <button onClick={rotateRight} style={{ marginLeft: 10 }} title="Rotate Right">
                        <RotateRightOutlined />
                    </button>

                    <button onClick={zoomOut} style={{ marginLeft: 16 }}>
                        <MinusOutlined />
                    </button>

                    <button onClick={zoomIn} style={{ marginLeft: 10 }}>
                        <PlusOutlined />
                    </button>

                    <button
                        onClick={fitToPage}
                        style={{ marginLeft: 14 }}
                        title="Fit to Page"
                    >
                        <FullscreenOutlined />
                    </button>

                    <span style={{ marginLeft: 18 }}>
                        {(scale * 100).toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* PDF + Highlights */}
            <div
                ref={viewerRef}
                style={{
                    position: "relative",
                    width: "100%",
                    height: "calc(100% - 45px)",
                    overflowY: "scroll", // Force scrollbar to prevent resize jitter
                    overflowX: overflowX, // 🔥 managed by state
                    background: "#f5f5f5",
                }}
            >
                <canvas ref={canvasRef} style={{ display: "block" }} />
                <div
                    ref={highlightRef}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                    }}
                />
            </div>
        </div>
    );
};

export default PdfViewerWithHighlight;
