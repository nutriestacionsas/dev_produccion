"""Add enviado_despacho_cliente and despacho_cliente tracking fields

Revision ID: 534b6ba02902
Revises: f1ce16670e5e
Create Date: 2026-09-23 11:45:34.590332

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '534b6ba02902'
down_revision: Union[str, Sequence[str], None] = 'f1ce16670e5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('orden_produccion_dias', sa.Column('enviado_despacho_cliente', sa.Boolean(), nullable=True))
    op.add_column('despacho_clientes', sa.Column('ruta_asignada', sa.String(length=255), nullable=True))
    op.add_column('despacho_clientes', sa.Column('usuario_id', sa.Integer(), nullable=True))

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('despacho_clientes', 'usuario_id')
    op.drop_column('despacho_clientes', 'ruta_asignada')
    op.drop_column('orden_produccion_dias', 'enviado_despacho_cliente')
