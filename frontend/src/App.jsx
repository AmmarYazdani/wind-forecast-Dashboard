
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import "./App.css";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
  const [selectedDate, setSelectedDate] = useState("2026-01-01");

  
const downloadCSV = () => {
  if (!data?.comparisons?.length) return;

  const headers = [
    "Time (UTC)",
    "Forecast (MW)",
    "Actual (MW)",
    "Error (MW)",
    "Absolute Error (MW)",
  ];

  const rows = data.comparisons.map((item) => [
    item.startTime,
    item.forecast,
    item.actual,
    item.error,
    item.absolute_error,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wind-forecast-${selectedDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};


  useEffect(() => {
    setLoading(true);
    setError("");

    fetch(`/api/accuracy?day=${selectedDate}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch accuracy data");
        }
        return response.json();
      })
      .then((result) => {
        if (result.error) {
          throw new Error(result.error);
        }
        setData(result);
        setShowAllRows(false);
      })
      .catch((err) => {
        setError(err.message);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  if (loading) {
    return <h2>Loading wind forecast data...</h2>;
  }

 
if (error) {
  return (
    <main className="dashboard">
      <header>
        <h1>UK Wind Forecast Dashboard</h1>
        <p>Forecast accuracy analysis</p>
      </header>

      <div className="date-filter">
        <label htmlFor="forecast-date">Select date:</label>
        <input
          id="forecast-date"
          type="date"
          value={selectedDate}
          min="2026-01-01"
          max="2026-01-31"
          onChange={(event) => setSelectedDate(event.target.value)}
        />
      </div>

      <section className="chart-card">
        <h2>No data available</h2>
        <p>
          {error.includes("No eligible forecasts")
            ? "No eligible forecast data was found for this date. Please select another date."
            : error}
        </p>
        <button
          className="show-more-button"
          onClick={() => {
            setSelectedDate("2026-01-01");
          }}
        >
          Return to January 1
        </button>
      </section>
    </main>
  );
}


  return (
    <main className="dashboard">
      <header>
        <h1>UK Wind Forecast Dashboard</h1>
        <p>
          Forecast accuracy analysis · {data.date}
          {" · "}Forecast published:{" "}
          {data.forecast_publish_time
            .replace("T", " ")
            .replace("Z", " UTC")}
        </p>
      </header>

      <div className="date-filter">
        <label htmlFor="forecast-date">Select date:</label>
        <input
          id="forecast-date"
          type="date"
          value={selectedDate}
          min="2026-01-01"
          max="2026-01-31"
          onChange={(event) => setSelectedDate(event.target.value)}
        />
      </div>

      <section className="metrics">
        <article className="metric-card">
          <h3>Average Forecast</h3>
          <p>{data.average_forecast_mw.toLocaleString()} MW</p>
        </article>

        <article className="metric-card">
          <h3>Average Actual</h3>
          <p>{data.average_actual_mw.toLocaleString()} MW</p>
        </article>

        <article className="metric-card">
          <h3>MAE</h3>
          <p>{data.mae_mw.toLocaleString()} MW</p>
        </article>

        <article className="metric-card">
          <h3>RMSE</h3>
          <p>{data.rmse_mw.toLocaleString()} MW</p>
        </article>

        <article className="metric-card">
          <h3>MAPE</h3>
          <p>{data.mape_percent}%</p>
        </article>
      </section>

      <section className="chart-card">
        <h2>Forecast vs Actual Wind Generation</h2>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data.comparisons}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="startTime"
              tickFormatter={(value) => value.slice(11, 16)}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="forecast"
              name="Forecast (MW)"
              stroke="#2563eb"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              name="Actual (MW)"
              stroke="#16a34a"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="table-card">
        <h2>Hourly Wind Generation Data</h2>
        <button
        type="button"
        className="download-button"
        onClick={downloadCSV}
      >
        Download CSV
      </button>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Forecast (MW)</th>
                <th>Actual (MW)</th>
                <th>Error (MW)</th>
                <th>Absolute Error (MW)</th>
              </tr>
            </thead>

            <tbody>
              {(showAllRows
                ? data.comparisons
                : data.comparisons.slice(0, 6)
              ).map((item) => (
                <tr key={item.startTime}>
                  <td>{item.startTime.slice(11, 16)}</td>
                  <td>{item.forecast.toLocaleString()}</td>
                  <td>{item.actual.toLocaleString()}</td>
                  <td
                    className={
                      item.error >= 0
                        ? "positive-error"
                        : "negative-error"
                    }
                  >
                    {item.error.toLocaleString()}
                  </td>
                  <td>{item.absolute_error.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.comparisons.length > 6 && (
            <button
              type="button"
              className="show-more-button"
              onClick={() =>
                setShowAllRows((previous) => !previous)
              }
            >
              {showAllRows ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </section>

      <p className="footer">
        Data source: Elexon BMRS API · Matched hours:{" "}
        {data.matched_hours}
      </p>
    </main>
  );
}

export default App;
