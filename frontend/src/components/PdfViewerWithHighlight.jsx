import React, { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import { Button, Tooltip } from "antd";

import {
    LeftOutlined,
    RightOutlined,
    PlusOutlined,
    MinusOutlined,
    FullscreenOutlined,
    RotateLeftOutlined,
    RotateRightOutlined
} from "@ant-design/icons";

// IMPORTANT — Use CDN for worker to ensure it works in production builds
// Worker version must match the pdfjs version bundled with react-pdf (5.4.296)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.mjs`;

const PdfViewerWithHighlight = ({ file, extractedData }) => {
    const viewerRef = useRef(null);
    const canvasRef = useRef(null);
    const highlightRef = useRef(null);

    const [pdf, setPdf] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(0.86);
    const [rotation, setRotation] = useState(0);



    // Extract all highlight regions
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

    // -------------------------------
    // Load PDF
    // -------------------------------
    useEffect(() => {
        if (!file) return;

        const loadPdf = async () => {
            try {
                const loadingTask = pdfjs.getDocument(file);
                const loadedPdf = await loadingTask.promise;
                setPdf(loadedPdf);

                // Render first page
                renderPage(loadedPdf, 1, scale, rotation);
            } catch (error) {
                console.error("Error loading PDF:", error);
            }
        };

        loadPdf();
    }, [file]);

    // -------------------------------
    // Render Page
    // -------------------------------
    const renderPage = async (pdfDoc, num, zoom, rot) => {
        const page = await pdfDoc.getPage(num);

        const viewport = page.getViewport({ scale: zoom, rotation: rot });

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Highlight overlay
        const overlay = highlightRef.current;
        overlay.innerHTML = "";
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;

        drawHighlights(viewport, num, page);
    };

    // -------------------------------
    // Draw highlights
    // -------------------------------
    const drawHighlights = (viewport, pageNumber, page) => {
        const overlay = highlightRef.current;

        // PDF coordinate system height
        const pageHeightPts = page.view?.[3] || 792;

        const regions = allRegions.filter((r) => r.page_number === pageNumber);

        regions.forEach((r) => {
            const xs = [];
            const ys = [];

            for (let i = 0; i < r.polygon.length; i += 2) {
                const xInch = r.polygon[i];
                const yInch = r.polygon[i + 1];

                // Convert inches → PDF points
                const xPt = xInch * 72;
                const yPt = pageHeightPts - yInch * 72;

                const [vx, vy] = viewport.convertToViewportPoint(xPt, yPt);

                xs.push(vx);
                ys.push(vy);
            }

            const box = document.createElement("div");
            box.style.position = "absolute";
            box.style.left = `${Math.min(...xs)}px`;
            box.style.top = `${Math.min(...ys)}px`;
            box.style.width = `${Math.max(...xs) - Math.min(...xs)}px`;
            box.style.height = `${Math.max(...ys) - Math.min(...ys)}px`;

            box.style.background = "rgba(144, 238, 144, 0.35)";
            box.style.border = "2px solid rgba(60, 179, 113, 0.9)";
            box.style.pointerEvents = "none";

            overlay.appendChild(box);
        });
    };

    // -------------------------------
    // Page Navigation
    // -------------------------------
    const changePage = (delta) => {
        if (!pdf) return;
        const next = pageNum + delta;
        if (next >= 1 && next <= pdf.numPages) {
            setPageNum(next);
            renderPage(pdf, next, scale, rotation);
        }
    };

    // -------------------------------
    // Zoom / Rotate
    // -------------------------------
    const zoom = (inc) => {
        const newScale = Math.max(0.4, scale + inc);
        setScale(newScale);
        renderPage(pdf, pageNum, newScale, rotation);
    };

    const rotate = (inc) => {
        const newRot = (rotation + inc + 360) % 360;
        setRotation(newRot);
        renderPage(pdf, pageNum, scale, newRot);
    };

    return (
        <div style={{ width: "100%", height: "100%" }}>
            {/* Toolbar */}
            <div
                style={{
                    padding: "6px 10px",
                    background: "white",
                    borderBottom: "1px solid #ddd",
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <div>
                    <Button size="small" icon={<LeftOutlined />} onClick={() => changePage(-1)} />
                    <Button size="small" icon={<RightOutlined />} onClick={() => changePage(1)} />
                    <span style={{ marginLeft: 10 }}>
                        Page {pageNum} / {pdf?.numPages || "--"}
                    </span>
                </div>

                <div>
                    <Button size="small" icon={<RotateLeftOutlined />} onClick={() => rotate(-90)} />
                    <Button size="small" icon={<RotateRightOutlined />} onClick={() => rotate(90)} />
                    <Button size="small" icon={<MinusOutlined />} onClick={() => zoom(-0.2)} />
                    <Button size="small" icon={<PlusOutlined />} onClick={() => zoom(0.2)} />
                </div>
            </div>

            {/* PDF Canvas */}
            <div
                ref={viewerRef}
                style={{
                    overflow: "auto",
                    height: "calc(100% - 40px)",
                    position: "relative",
                    background: "#f5f5f5",
                }}
            >
                <canvas ref={canvasRef} />
                <div ref={highlightRef} style={{ position: "absolute", top: 0, left: 0 }} />
            </div>
        </div>
    );
};

export default PdfViewerWithHighlight;
