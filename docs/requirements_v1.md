Where is my money app should allow user to visually track transactions made during sertain period using interactive sankey diagram.

User should be able:
- import statements from multiple banks
- maintain tree of expense transaction categories
- view sankey diagram for any specified period

Statements import:
- user should be able to import statements from multiple banks in CSV format

The categories tree:
- user should be able to create, rename and remove nodes
- user should be able to map each expense to a category node
- user should be able to view expenses mapped to each node
- system should be able to suggest expense mapping for newly imported expenses based on the existing mappings
- each expense should be mapped to exactly one category

The sankey diagram should contain:
- a node per income transaction
- a separator node between income and expenses parts
- a node per expense transaction category, as maintained in the categories tree
- either a 'proficit' node (if income > expenses) or a 'deficit' node (if expenses > income) to balance the diagram; due to the Sankey link structure required for flow balance, Proficit appears on the expense side (right column, as a sink of total expenses) and Deficit appears on the income side (left column, as a synthetic income source)

ML suggestion configuration:
- user should be able to adjust the minimum ML confidence threshold via a slider available on both the Dashboard and Transactions pages
- the threshold controls which ML-suggested categories are auto-applied in the Sankey diagram; suggestions below the threshold are shown as dimmed badges in the transaction table instead of being applied
- the threshold value should be persisted in the backend database so it is restored automatically on next use