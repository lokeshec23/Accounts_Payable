// src/components/PdfViewerWithHighlight.jsx
import React, { useEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import {
    LeftOutlined,
    RightOutlined,
    PlusOutlined,
    MinusOutlined,
    FullscreenOutlined
} from "@ant-design/icons";

GlobalWorkerOptions.workerSrc = pdfWorker;

const PdfViewerWithHighlight = ({ file, extractedData }) => {
    const viewerRef = useRef(null);
    const canvasRef = useRef(null);
    const highlightRef = useRef(null);

    const [pdf, setPdf] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.0);
    const [initialAutoFitDone, setInitialAutoFitDone] = useState(false);

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

        const loadPdf = async () => {
            const loadingTask = getDocument(file);
            const loadedPdf = await loadingTask.promise;
            setPdf(loadedPdf);
            renderPage(loadedPdf, pageNum, scale);
        };

        loadPdf();
    }, [file]);

    // ------------------------------------------------------------
    // Render PDF Page
    // ------------------------------------------------------------
    const renderPage = async (pdfDoc, pageNumber, zoomScale) => {
        const page = await pdfDoc.getPage(pageNumber);

        let finalScale = zoomScale;

        // Auto-fit width on first load only
        if (!initialAutoFitDone) {
            const containerWidth = viewerRef.current.clientWidth;

            const base = page.getViewport({ scale: 1 });
            const fitWidthScale = containerWidth / base.width;

            finalScale = fitWidthScale;
            setScale(fitWidthScale);
            setInitialAutoFitDone(true);

            // Disable horizontal scroll only on first load
            viewerRef.current.style.overflowX = "hidden";
        }

        const viewport = page.getViewport({ scale: finalScale });

        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;

        // Prepare overlay
        const overlay = highlightRef.current;
        overlay.innerHTML = "";
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;

        drawHighlights(viewport, pageNumber);
    };

    // ------------------------------------------------------------
    // Draw Highlights
    // ------------------------------------------------------------
    const drawHighlights = (viewport, pageNumber) => {
        const overlay = highlightRef.current;

        const PAGE_INCH_WIDTH = 8.5;
        const PAGE_INCH_HEIGHT = 11;

        const pxInchX = viewport.width / PAGE_INCH_WIDTH;
        const pxInchY = viewport.height / PAGE_INCH_HEIGHT;

        const relevant = allRegions.filter((r) => r.page_number === pageNumber);

        relevant.forEach((reg) => {
            const p = reg.polygon;

            const xs = [];
            const ys = [];

            for (let i = 0; i < p.length; i += 2) {
                xs.push(p[i] * pxInchX);
                ys.push(p[i + 1] * pxInchY);
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
            renderPage(pdf, newPage, scale);
        }
    };

    const prevPage = () => {
        if (pdf && pageNum > 1) {
            const newPage = pageNum - 1;
            setPageNum(newPage);
            renderPage(pdf, newPage, scale);
        }
    };

    // ------------------------------------------------------------
    // Zoom Controls (enable horizontal scroll after zoom)
    // ------------------------------------------------------------
    const zoomIn = () => {
        viewerRef.current.style.overflowX = "auto";   // 🔥 enable horizontal scroll
        const newScale = scale + 0.2;
        setScale(newScale);
        renderPage(pdf, pageNum, newScale);
    };

    const zoomOut = () => {
        viewerRef.current.style.overflowX = "auto";   // 🔥 enable horizontal scroll
        const newScale = Math.max(0.4, scale - 0.2);
        setScale(newScale);
        renderPage(pdf, pageNum, newScale);
    };

    // ------------------------------------------------------------
    // Fit Entire Page
    // ------------------------------------------------------------
    const fitToPage = async () => {
        if (!pdf) return;
        viewerRef.current.style.overflowX = "hidden"; // page fits entirely

        const page = await pdf.getPage(pageNum);
        const base = page.getViewport({ scale: 1 });

        const viewerWidth = viewerRef.current.clientWidth;
        const viewerHeight = viewerRef.current.clientHeight;

        const scaleW = viewerWidth / base.width;
        const scaleH = viewerHeight / base.height;

        const final = Math.min(scaleW, scaleH);

        setScale(final);
        renderPage(pdf, pageNum, final);
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
                    <button onClick={zoomOut}>
                        <MinusOutlined />
                    </button>

                    <button onClick={zoomIn} style={{ marginLeft: 10 }}>
                        <PlusOutlined />
                    </button>

                    <button
                        onClick={fitToPage}
                        style={{ marginLeft: 14 }}
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
                    overflowY: "auto",
                    overflowX: "hidden", // 🔥 initial load → no horizontal scroll
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
