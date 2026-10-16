// pages/admin/ProductBulkUploadPage.jsx
import { useRef, useState } from "react";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = {
  bg: "#0B0B0C",
  panel: "#151516",
  ink: "#F3EFE6",
  muted: "#8A877F",
  border: "#2B2B30",
  gold: "#C9A24B",
  goldBg: "#C9A24B14",
  danger: "#C2503A",
  dangerBg: "#C2503A14",
  success: "#4B9E6E",
  successBg: "#4B9E6E14",
};

export default function ProductBulkUploadPage() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState(null); // { message, productsCreated, skippedSKUs, ... }
  const [error, setError] = useState("");

  const pickFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Only .zip files are allowed");
      return;
    }
    setError("");
    setResult(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError("");
    setResult(null);

    try {
      const token = JSON.parse(localStorage.getItem("userInfo") || "{}")?.token;
      const formData = new FormData();
      formData.append("file", file);

      const { data } = await axios.post(
        `${BACKEND_URL}/api/products/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err.message ||
          "Upload failed — check server logs",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.gold,
        }}
      >
        Admin · Catalogue
      </p>
      <h1
        style={{
          margin: "4px 0 6px",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        Bulk Upload Products
      </h1>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 14,
          color: C.muted,
          maxWidth: 620,
        }}
      >
        Upload a single .zip containing one Excel file (products.xlsx) and the
        product images referenced in it. Each row creates one product variant.
      </p>

      <a
        href="/templates/Product_Bulk_Upload_Template.xlsx"
        download
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 18px",
          borderRadius: 8,
          border: `1px solid ${C.gold}`,
          background: "transparent",
          color: C.gold,
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
          marginBottom: 28,
        }}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14}>
          <path
            fillRule="evenodd"
            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3z"
            clipRule="evenodd"
          />
        </svg>
        Download Excel Template
      </a>

      {/* ── Dropzone ── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.gold : file ? C.gold : C.border}`,
          borderRadius: 14,
          padding: "40px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? C.goldBg : C.panel,
          transition: "border-color 0.15s, background 0.15s",
          maxWidth: 560,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          width={30}
          height={30}
          style={{ color: file ? C.gold : C.muted, margin: "0 auto 10px" }}
        >
          <path
            fillRule="evenodd"
            d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>

        {file ? (
          <>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 14,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              {file.name}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
              {(file.size / (1024 * 1024)).toFixed(2)} MB — click to change
            </p>
          </>
        ) : (
          <>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 14,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Drop your .zip here, or click to browse
            </p>
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
              Must contain products.xlsx + referenced images
            </p>
          </>
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: 16,
            maxWidth: 560,
            background: C.dangerBg,
            border: `1px solid ${C.danger}55`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: C.danger,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            border: "none",
            background: !file || isUploading ? "#8A6F2E" : C.gold,
            color: "#0B0B0C",
            fontWeight: 700,
            fontSize: 13,
            cursor: !file || isUploading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isUploading ? (
            <>
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid #0B0B0C55",
                  borderTop: "2px solid #0B0B0C",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
              Uploading…
            </>
          ) : (
            "Upload & Create Products"
          )}
        </button>
        {(file || result) && (
          <button
            onClick={reset}
            disabled={isUploading}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.muted,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Result summary ── */}
      {result && (
        <div style={{ marginTop: 32, maxWidth: 700 }}>
          <div
            style={{
              background: C.successBg,
              border: `1px solid ${C.success}55`,
              borderRadius: 10,
              padding: "16px 20px",
              marginBottom: 16,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: C.success,
              }}
            >
              ✓ {result.message}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted }}>
              {result.productsCreated} product(s) created
              {result.skipped ? `, ${result.skipped} skipped` : ""}
            </p>
          </div>

          {result.skippedSKUs?.length > 0 && (
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.ink,
                }}
              >
                Skipped SKUs (already existed)
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.skippedSKUs.map((sku) => (
                  <span
                    key={sku}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: C.dangerBg,
                      color: C.danger,
                      border: `1px solid ${C.danger}33`,
                    }}
                  >
                    {sku}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Template help ── */}
      <div
        style={{
          marginTop: 40,
          maxWidth: 700,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "18px 20px",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            fontWeight: 600,
            color: C.gold,
          }}
        >
          Excel column reference
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          SKU, productGroupId, brandname, description, images (pipe-separated
          filenames e.g. 1.jpg|2.jpg|3.jpg), sizeChart, washCare
          (pipe-separated), gender, category, subcategory, type, ageRange,
          fabric, color, sizes (comma-separated), stockBySize (e.g.
          S:10,M:15,L:8), oldPrice, discount, weight, length, width, height,
          street1, city, state, zip, country.
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
