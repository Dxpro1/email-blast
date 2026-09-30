import { DEFAULT_ENCORE_DESIGN } from './defaultDesign';

const logoRow = DEFAULT_ENCORE_DESIGN.body.rows[0];
const footerRow = DEFAULT_ENCORE_DESIGN.body.rows[2];

export const TEMPLATES = [
  {
    name: 'Basic Layout',
    design: DEFAULT_ENCORE_DESIGN
  },
  {
    name: 'Promo Campaign',
    design: {
      body: {
        rows: [
          logoRow,
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "image",
                    values: {
                      src: {
                        url: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80",
                        width: 600,
                        height: "auto"
                      },
                      textAlign: "center",
                      padding: "0px"
                    }
                  }
                ],
                values: { backgroundColor: "#ffffff" }
              }
            ],
            values: { backgroundColor: "#ffffff" }
          },
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "heading",
                    values: {
                      headingType: "h1",
                      text: "Special Promo Just For You!",
                      textAlign: "center",
                      color: "#102CA4",
                      padding: "30px 20px 10px"
                    }
                  },
                  {
                    type: "paragraph",
                    values: {
                      text: "Hi #firstname,<br><br>Don't miss out on our limited-time offer. Get the best financing rates today.",
                      textAlign: "center",
                      color: "#4b5563",
                      padding: "10px 20px 30px"
                    }
                  },
                  {
                    type: "button",
                    values: {
                      text: "Claim Your Offer",
                      backgroundColor: "#FFDF00",
                      color: "#102CA4",
                      borderRadius: "4px",
                      textAlign: "center",
                      padding: "10px 20px"
                    }
                  }
                ],
                values: { backgroundColor: "#ffffff" }
              }
            ],
            values: { backgroundColor: "#ffffff" }
          },
          footerRow
        ],
        values: {
          backgroundColor: "#f1f5f9",
          fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }
        }
      }
    }
  },
  {
    name: 'Important Announcement',
    design: {
      body: {
        rows: [
          logoRow,
          {
            cells: [1],
            columns: [
              {
                contents: [
                  {
                    type: "heading",
                    values: {
                      headingType: "h1",
                      text: "System Announcement",
                      textAlign: "left",
                      color: "#b91c1c", // red-700
                      padding: "30px 20px 10px"
                    }
                  },
                  {
                    type: "paragraph",
                    values: {
                      text: "Dear #firstname,<br><br>Please be informed of our recent policy changes...",
                      textAlign: "left",
                      color: "#4b5563",
                      padding: "10px 20px 30px"
                    }
                  }
                ],
                values: { backgroundColor: "#ffffff" }
              }
            ],
            values: { backgroundColor: "#ffffff" }
          },
          footerRow
        ],
        values: {
          backgroundColor: "#f1f5f9",
          fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" }
        }
      }
    }
  }
];
