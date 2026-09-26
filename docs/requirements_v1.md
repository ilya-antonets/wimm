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
- either a 'deficit' on expenses part or 'proficit' node on income part to balance them